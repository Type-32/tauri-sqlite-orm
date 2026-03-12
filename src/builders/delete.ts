import { Kysely } from 'kysely'
import { AnyTable, InferSelectModel } from '../types'
import { MissingWhereClauseError } from '../errors'
import { Condition } from '../operators'
import { deserializeValue } from '../serialization'

export class DeleteQueryBuilder<T extends AnyTable> {
    private _builder: any
    private _table: T
    private _returningColumns: (keyof T['_']['columns'])[] = []
    private _hasWhereClause = false
    private _allowGlobal = false

    constructor(private readonly kysely: Kysely<any>, table: T) {
        this._table = table
        this._builder = kysely.deleteFrom(table._.name)
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

    where(condition: Condition): this {
        this._hasWhereClause = true
        this._builder = this._builder.where(condition)
        return this
    }

    allowGlobalOperation(): this {
        this._allowGlobal = true
        return this
    }

    returning(...columns: (keyof T['_']['columns'])[]): this {
        this._returningColumns.push(...columns)
        return this
    }

    async execute(): Promise<T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never> {
        if (!this._hasWhereClause && !this._allowGlobal) {
            throw new MissingWhereClauseError('DELETE', this._table._.name)
        }

        if (this._returningColumns.length > 0) {
            const cols = this._returningColumns.map(
                (k) => this._table._.columns[k as string]._.name
            )
            const rows = await this._builder.returning(cols).execute()
            return this.mapReturningRows(rows) as any
        }

        const result = await this._builder.executeTakeFirst()
        return [{ rowsAffected: Number(result?.numDeletedRows ?? 0) }] as any
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
        let builder = this._builder
        if (this._returningColumns.length > 0) {
            builder = builder.returning(
                this._returningColumns.map((k) => this._table._.columns[k as string]._.name)
            )
        }
        const compiled = builder.compile()
        return { sql: compiled.sql, params: [...compiled.parameters] }
    }
}
