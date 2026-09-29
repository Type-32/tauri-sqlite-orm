import { Kysely, sql } from 'kysely'
import { InferInsertModel } from '../orm'
import { AnyTable, InferSelectModel } from '../types'
import { MissingWhereClauseError, UpdateValidationError, ColumnNotFoundError } from '../errors'
import { serializeValue, deserializeValue } from '../serialization'
import { Condition } from '../operators'

export class UpdateQueryBuilder<T extends AnyTable> {
    private _builder: any
    private _table: T
    private _updateData: Partial<InferInsertModel<T>> = {}
    private _returningColumns: (keyof T['_']['columns'])[] = []
    private _hasWhereClause = false
    private _allowGlobal = false
    private _incrementDecrementOps: Array<{
        column: string
        op: 'increment' | 'decrement'
        value: number
    }> = []

    constructor(private readonly kysely: Kysely<any>, table: T) {
        this._table = table
        this._builder = kysely.updateTable(table._.name)
    }

    set(data: Partial<InferInsertModel<T>>): this {
        this._updateData = { ...this._updateData, ...data }
        return this
    }

    where(condition: Condition): this {
        this._hasWhereClause = true
        this._builder = this._builder.where(condition)
        return this
    }

    increment(column: keyof T['_']['columns'], value: number = 1): this {
        const col = this._table._.columns[column as string]
        if (!col) throw new ColumnNotFoundError(String(column), this._table._.name)
        this._incrementDecrementOps.push({ column: col._.name, op: 'increment', value })
        return this
    }

    decrement(column: keyof T['_']['columns'], value: number = 1): this {
        const col = this._table._.columns[column as string]
        if (!col) throw new ColumnNotFoundError(String(column), this._table._.name)
        this._incrementDecrementOps.push({ column: col._.name, op: 'decrement', value })
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

    private buildSetClause(): Record<string, any> {
        const finalData: Partial<InferInsertModel<T>> = { ...this._updateData }

        for (const [key, column] of Object.entries(this._table._.columns)) {
            if ((finalData as any)[key] === undefined && column.options.$onUpdateFn) {
                ;(finalData as any)[key] = column.options.$onUpdateFn()
            }
        }

        const entries = Object.entries(finalData)
        const hasSetData = entries.length > 0
        const hasOps = this._incrementDecrementOps.length > 0

        if (!hasSetData && !hasOps) {
            throw new UpdateValidationError(
                'Cannot execute an update query without a .set(), .increment(), or .decrement() call.'
            )
        }

        const setMap: Record<string, any> = {}

        for (const [key, value] of entries) {
            const column = (this._table._.columns as any)[key]
            if (!column) throw new ColumnNotFoundError(key, this._table._.name)
            setMap[column._.name] = serializeValue(value, column)
        }

        for (const op of this._incrementDecrementOps) {
            const sign = op.op === 'increment' ? '+' : '-'
            setMap[op.column] = sql.raw(`${op.column} ${sign} ${op.value}`)
        }

        return setMap
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        if (!this._hasWhereClause && !this._allowGlobal) {
            throw new MissingWhereClauseError('UPDATE', this._table._.name)
        }

        const setMap = this.buildSetClause()
        let builder = this._builder.set(setMap)

        if (this._returningColumns.length > 0) {
            const cols = this._returningColumns.map(
                (k) => this._table._.columns[k as string]._.name
            )
            const rows = await builder.returning(cols).execute()
            return this.mapReturningRows(rows) as any
        }

        const result = await builder.executeTakeFirst()
        return [{ rowsAffected: Number(result?.numUpdatedRows ?? 0) }] as any
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
        const setMap = this.buildSetClause()
        let builder = this._builder.set(setMap)

        if (this._returningColumns.length > 0) {
            builder = builder.returning(
                this._returningColumns.map((k) => this._table._.columns[k as string]._.name)
            )
        }

        const compiled = builder.compile()
        return { sql: compiled.sql, params: [...compiled.parameters] }
    }
}
