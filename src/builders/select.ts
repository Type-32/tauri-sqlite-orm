import { BaseQueryBuilder } from './query-base'
import Database from '@tauri-apps/plugin-sql'
import { and, eq } from '../operators'
import { SQLCondition } from '../orm'
import { AnySQLiteColumn, AnyTable } from '../types'

// Enhanced SelectQueryBuilder with proper aliasing and relation handling
export class SelectQueryBuilder<
    TTable extends AnyTable,
    TSelectedColumns extends (keyof TTable['_']['columns'])[] | undefined = undefined
> extends BaseQueryBuilder {
    private isDistinct = false
    private groupByColumns: AnySQLiteColumn[] = []
    private havingCondition: SQLCondition | null = null
    private joins: Array<{
        type: 'LEFT' | 'INNER' | 'RIGHT'
        table: AnyTable
        condition: SQLCondition
        alias: string
    }> = []
    private includeRelations: Record<string, boolean> = {}
    private selectedTableAlias: string
    private selectedColumns: string[] = []

    constructor(db: Database, private table: TTable, private columns?: TSelectedColumns) {
        super(db)
        this.selectedTableAlias = table._.name

        // Build initial SELECT with table alias to avoid ambiguity
        this.selectedColumns = columns
            ? columns.map((c) => `${this.selectedTableAlias}.${table._.columns[c as string]._.name}`)
            : [`${this.selectedTableAlias}.*`]

        this.query = `FROM ${table._.name} ${this.selectedTableAlias}`
    }

    distinct(): this {
        this.isDistinct = true
        return this
    }

    groupBy(...columns: AnySQLiteColumn[]): this {
        this.groupByColumns.push(...columns)
        const columnNames = columns.map((col) => `${this.selectedTableAlias}.${col._.name}`).join(', ')
        this.query += ` GROUP BY ${columnNames}`
        return this
    }

    having(condition: SQLCondition): this {
        this.havingCondition = condition
        this.query += ` HAVING ${condition.sql}`
        this.params.push(...condition.params)
        return this
    }

    leftJoin<T extends AnyTable>(table: T, condition: SQLCondition, alias: string): this {
        this.joins.push({ type: 'LEFT', table, condition, alias })
        this.selectedColumns.push(`${alias}.*`)
        return this
    }

    innerJoin<T extends AnyTable>(table: T, condition: SQLCondition, alias: string): this {
        this.joins.push({ type: 'INNER', table, condition, alias })
        this.selectedColumns.push(`${alias}.*`)
        return this
    }

    include(relations: Record<string, boolean>): this {
        this.includeRelations = { ...this.includeRelations, ...relations }
        return this
    }

    private buildJoins(): { sql: string; params: any[] } {
        let sql = ''
        const params: any[] = []

        // First add manual joins
        for (const join of this.joins) {
            sql += ` ${join.type} JOIN ${join.table._.name} ${join.alias} ON ${join.condition.sql}`
            params.push(...join.condition.params)
        }

        // Then handle relations
        for (const [relationName, include] of Object.entries(this.includeRelations)) {
            if (!include) continue

            const relation = this.table.relations[relationName]
            if (!relation) continue

            const foreignTable = relation.foreignTable
            const foreignAlias = `${this.selectedTableAlias}_${relationName}`
            this.selectedColumns.push(`${foreignAlias}.*`)

            if (relation.type === 'one' && relation.fields && relation.references) {
                // One-to-one or many-to-one: this table references foreign table
                const conditions = relation.fields.map((field, i) => {
                    const localColumn = `${this.selectedTableAlias}.${field._.name}`
                    const foreignColumn = `${foreignAlias}.${relation.references![i]._.name}`
                    return {
                        sql: `${localColumn} = ${foreignColumn}`,
                        params: [],
                    }
                })
                const condition = conditions.length > 1 ? and(...conditions) : conditions[0]

                sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${condition.sql}`
                params.push(...condition.params)
            } else if (relation.type === 'many') {
                // One-to-many: foreign table references this table
                const refRelation = Object.entries(foreignTable.relations).find(
                    ([_, r]) => r.foreignTable === this.table
                )

                if (refRelation && refRelation[1].fields && refRelation[1].references) {
                    const [_, relationConfig] = refRelation
                    const conditions = relationConfig.fields!.map((field, i) => {
                        const localColumn = `${foreignAlias}.${field._.name}`
                        const foreignColumn = `${this.selectedTableAlias}.${relationConfig.references![i]._.name}`
                        return {
                            sql: `${localColumn} = ${foreignColumn}`,
                            params: [],
                        }
                    })
                    const condition = conditions.length > 1 ? and(...conditions) : conditions[0]

                    sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${condition.sql}`
                    params.push(...condition.params)
                }
            }
        }

        return { sql, params }
    }

    // Enhanced execute method that handles relation data mapping
    async execute(): Promise<any[]> {
        const { sql: joinSql, params: joinParams } = this.buildJoins()

        const distinct = this.isDistinct ? 'DISTINCT ' : ''
        this.query = `SELECT ${distinct}${this.selectedColumns.join(', ')} ${this.query}`
        this.query += joinSql
        this.params.push(...joinParams)

        const { sql, params } = this.build()
        console.log('Executing SQL:', sql, 'with params:', params) // Debug log

        const rawResults = await this.db.select<any[]>(sql, params)

        // Process results to group related data
        if (Object.keys(this.includeRelations).some((key) => this.includeRelations[key])) {
            const processed = this.processRelationResults(rawResults)
            return processed
        }

        return rawResults
    }

    private processRelationResults(rawResults: any[]): any[] {
        if (!rawResults.length) return rawResults

        return rawResults.map((row) => {
            const result: any = {}
            const relations: any = {}

            // Process each column in the row
            for (const [key, value] of Object.entries(row)) {
                // Handle aliased columns (table.column format)
                if (key.includes('.')) {
                    const [tableAlias, columnName] = key.split('.')

                    // Check if this is our main table
                    if (tableAlias === this.selectedTableAlias) {
                        result[columnName] = value
                    } else {
                        // This is from a joined table - try to extract relation info
                        // Format: mainTable_relationName
                        const parts = tableAlias.split('_')
                        if (parts.length >= 2 && parts[0] === this.selectedTableAlias) {
                            const relationName = parts.slice(1).join('_')
                            if (!relations[relationName]) relations[relationName] = {}
                            relations[relationName][columnName] = value
                        } else {
                            // Fallback - just use the alias as key
                            if (!result[tableAlias]) result[tableAlias] = {}
                            result[tableAlias][columnName] = value
                        }
                    }
                } else {
                    // No alias - assume main table column
                    result[key] = value
                }
            }

            // Attach relations that have actual data
            for (const [relName, relData] of Object.entries(relations)) {
                const hasData = Object.values(relData as Record<string, any>).some(
                    (v) => v !== null && v !== undefined && v !== ''
                )
                if (hasData) {
                    result[relName] = relData
                }
            }

            return result
        })
    }

    // Update the return type signatures
    async all(): Promise<any[]> {
        return this.execute()
    }

    async get(): Promise<any | undefined> {
        this.limit(1)
        const result = await this.execute()
        return result[0]
    }
}
