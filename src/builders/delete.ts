import { BaseQueryBuilder } from './query-base'
import Database from '@tauri-apps/plugin-sql'
import { AnyTable, InferSelectModel } from '../types'
import { MissingWhereClauseError } from '../errors'

export class DeleteQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
    private returningColumns: (keyof T['_']['columns'])[] = []
    private hasWhereClause = false
    private allowGlobal = false

    constructor(db: Database, private table: T) {
        super(db)
        this.query = `DELETE FROM ${table._.name}`
    }

    where(condition: any): this {
        this.hasWhereClause = true
        return super.where(condition)
    }

    allowGlobalOperation(): this {
        this.allowGlobal = true
        return this
    }

    returning(...columns: (keyof T['_']['columns'])[]): this {
        this.returningColumns.push(...columns)
        return this
    }

    async execute(): Promise<T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never> {
        // Validate WHERE clause exists unless explicitly allowed
        if (!this.hasWhereClause && !this.allowGlobal) {
            throw new MissingWhereClauseError('DELETE', this.table._.name)
        }

        const { sql, params } = this.build()

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(', ')
            const sqlWithReturning = `${sql} RETURNING ${returningNames}`
            return this.db.select(sqlWithReturning, params) as any
        } else {
            const result = await this.db.execute(sql, params)
            return [{ rowsAffected: result.rowsAffected }] as any
        }
    }

    async returningAll(): Promise<InferSelectModel<T>[]> {
        const allColumns = Object.keys(this.table._.columns) as (keyof T['_']['columns'])[]
        return this.returning(...allColumns).execute()
    }

    async returningFirst(): Promise<InferSelectModel<T> | undefined> {
        const allColumns = Object.keys(this.table._.columns) as (keyof T['_']['columns'])[]
        const results = await this.returning(...allColumns).execute()
        return results[0] as InferSelectModel<T> | undefined
    }

    toSQL(): { sql: string; params: any[] } {
        // Note: toSQL() doesn't validate WHERE clause - it's for debugging only
        const { sql, params } = this.build()

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(', ')
            return {
                sql: `${sql} RETURNING ${returningNames}`,
                params,
            }
        }

        return { sql, params }
    }
}
