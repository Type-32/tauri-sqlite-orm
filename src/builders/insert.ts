import { Kysely } from 'kysely'
import { InferInsertModel } from '../orm'
import { AnySQLiteColumn, AnyTable, InferSelectModel } from '../types'
import { InsertValidationError } from '../errors'
import { serializeValue, deserializeValue } from '../serialization'

export class InsertQueryBuilder<T extends AnyTable> {
    private _builder: any
    private _table: T
    private _dataSets: InferInsertModel<T>[] = []
    private _returningColumns: (keyof T['_']['columns'])[] = []
    private _onConflictAction: 'nothing' | 'update' | null = null
    private _conflictTarget: AnySQLiteColumn[] = []
    private _updateSet: Partial<InferInsertModel<T>> = {}

    constructor(private readonly kysely: Kysely<any>, table: T) {
        this._table = table
        this._builder = kysely.insertInto(table._.name)
    }

    values(data: InferInsertModel<T> | InferInsertModel<T>[]): this {
        const arr = Array.isArray(data) ? data : [data]
        this._dataSets.push(...arr)
        return this
    }

    returning(...columns: (keyof T['_']['columns'])[]): this {
        this._returningColumns.push(...columns)
        return this
    }

    onConflictDoNothing(target?: AnySQLiteColumn | AnySQLiteColumn[]): this {
        this._onConflictAction = 'nothing'
        if (target) {
            this._conflictTarget = Array.isArray(target) ? target : [target]
        }
        return this
    }

    onConflictDoUpdate(config: {
        target: AnySQLiteColumn | AnySQLiteColumn[]
        set: Partial<InferInsertModel<T>>
    }): this {
        this._onConflictAction = 'update'
        this._conflictTarget = Array.isArray(config.target) ? config.target : [config.target]
        this._updateSet = config.set
        return this
    }

    private processDefaults(data: InferInsertModel<T>): Partial<InferInsertModel<T>> {
        const out: Partial<InferInsertModel<T>> = { ...data }
        for (const [key, column] of Object.entries(this._table._.columns)) {
            if ((out as any)[key] === undefined && column.options.$defaultFn) {
                ;(out as any)[key] = column.options.$defaultFn()
            }
        }
        return out
    }

    private mapReturningRows(rows: any[]): InferSelectModel<T>[] {
        const dbNameToTs: Record<string, string> = {}
        for (const [tsName, col] of Object.entries(this._table._.columns)) {
            dbNameToTs[col._.name] = tsName
        }
        const norm = (k: string) => (k.startsWith('"') && k.endsWith('"') ? k.slice(1, -1) : k)
        return rows.map((row: Record<string, any>) => {
            const out: Record<string, any> = {}
            for (const [dbKey, value] of Object.entries(row)) {
                const logicalKey = norm(dbKey)
                const tsName = dbNameToTs[logicalKey] ?? logicalKey
                const column = this._table._.columns[tsName]
                out[tsName] = column ? deserializeValue(value, column) : value
            }
            return out
        }) as InferSelectModel<T>[]
    }

    private serializeDataSet(data: Partial<InferInsertModel<T>>): Record<string, any> {
        const out: Record<string, any> = {}
        for (const [key, value] of Object.entries(data)) {
            const column = this._table._.columns[key]
            out[column ? column._.name : key] = column ? serializeValue(value, column) : value
        }
        return out
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        if (this._dataSets.length === 0) {
            throw new InsertValidationError(
                'No data provided for insert. Use .values() to provide data.'
            )
        }

        const processed = this._dataSets.map((d) => this.serializeDataSet(this.processDefaults(d)))

        let builder = this._builder.values(processed.length === 1 ? processed[0] : processed)

        if (this._onConflictAction === 'nothing') {
            if (this._conflictTarget.length > 0) {
                const targetCols = this._conflictTarget.map((c) => c._.name)
                builder = builder.onConflict((oc: any) =>
                    oc.columns(targetCols).doNothing()
                )
            } else {
                builder = builder.onConflict((oc: any) => oc.doNothing())
            }
        } else if (this._onConflictAction === 'update') {
            const targetCols = this._conflictTarget.map((c) => c._.name)
            const updateData = this.serializeDataSet(this._updateSet as any)
            builder = builder.onConflict((oc: any) =>
                oc.columns(targetCols).doUpdateSet(updateData)
            )
        }

        if (this._returningColumns.length > 0) {
            const cols = this._returningColumns.map(
                (k) => this._table._.columns[k as string]._.name
            )
            const rows = await builder.returning(cols).execute()
            return this.mapReturningRows(rows) as any
        }

        const result = await builder.executeTakeFirst()
        return [
            {
                lastInsertId: Number(result?.insertId ?? 0),
                rowsAffected: Number(result?.numInsertedOrUpdatedRows ?? 0),
            },
        ] as any
    }

    async returningAll(): Promise<InferSelectModel<T>[]> {
        const allCols = Object.keys(this._table._.columns) as (keyof T['_']['columns'])[]
        return this.returning(...allCols).execute() as any
    }

    async returningFirst(): Promise<InferSelectModel<T> | undefined> {
        const results = await this.returningAll()
        return results[0]
    }

    toSQL(): { sql: string; params: any[] } {
        if (this._dataSets.length === 0) {
            throw new InsertValidationError(
                'No data provided for insert. Use .values() to provide data.'
            )
        }
        const processed = this._dataSets.map((d) => this.serializeDataSet(this.processDefaults(d)))
        let builder = this._builder.values(processed.length === 1 ? processed[0] : processed)

        if (this._onConflictAction === 'nothing') {
            if (this._conflictTarget.length > 0) {
                builder = builder.onConflict((oc: any) =>
                    oc.columns(this._conflictTarget.map((c) => c._.name)).doNothing()
                )
            } else {
                builder = builder.onConflict((oc: any) => oc.doNothing())
            }
        } else if (this._onConflictAction === 'update') {
            const updateData = this.serializeDataSet(this._updateSet as any)
            builder = builder.onConflict((oc: any) =>
                oc
                    .columns(this._conflictTarget.map((c) => c._.name))
                    .doUpdateSet(updateData)
            )
        }

        if (this._returningColumns.length > 0) {
            builder = builder.returning(
                this._returningColumns.map((k) => this._table._.columns[k as string]._.name)
            )
        }

        const compiled = builder.compile()
        return { sql: compiled.sql, params: [...compiled.parameters] }
    }
}
