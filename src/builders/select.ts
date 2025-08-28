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
    private includeRelations: Partial<Record<keyof TTable['relations'], boolean>> = {}
    private selectedTableAlias: string
    private selectedColumns: string[] = []

    constructor(db: Database, private table: TTable, private columns?: TSelectedColumns) {
        super(db)
        this.selectedTableAlias = table._.name

        const selected = columns
            ? columns.map((c) => this.table._.columns[c as string])
            : Object.values(this.table._.columns)

        this.selectedColumns = selected.map(
            (col) => `${this.selectedTableAlias}.${col._.name} AS "${this.selectedTableAlias}.${col._.name}"`
        )

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
        const aliasedColumns = Object.values(table._.columns).map(
            (col) => `${alias}.${col._.name} AS "${alias}.${col._.name}"`
        )
        this.selectedColumns.push(...aliasedColumns)
        return this
    }

    innerJoin<T extends AnyTable>(table: T, condition: SQLCondition, alias: string): this {
        this.joins.push({ type: 'INNER', table, condition, alias })
        const aliasedColumns = Object.values(table._.columns).map(
            (col) => `${alias}.${col._.name} AS "${alias}.${col._.name}"`
        )
        this.selectedColumns.push(...aliasedColumns)
        return this
    }

    include(relations: Partial<Record<keyof TTable['relations'], boolean>>): this {
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
            if (!relation) {
                console.warn(
                    `[Tauri-ORM] Relation "${relationName}" not found on table "${this.table._.name}". Skipping include.`
                )
                continue
            }

            const foreignTable = relation.foreignTable
            const foreignAlias = `${this.selectedTableAlias}_${relationName}`

            const aliasedColumns = Object.values(foreignTable._.columns).map(
                (col) => `${foreignAlias}.${col._.name} AS "${foreignAlias}.${col._.name}"`
            )
            this.selectedColumns.push(...aliasedColumns)

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

        const hasIncludes = Object.values(this.includeRelations).some((i) => i)
        if (hasIncludes) {
            return this.processRelationResults(rawResults)
        }

        const hasJoins = this.joins.length > 0
        if (hasJoins) {
            return rawResults
        }

        // Strip prefixes for simple queries
        const prefix = `${this.selectedTableAlias}.`
        return rawResults.map((row) => {
            const newRow: Record<string, any> = {}
            for (const key in row) {
                if (key.startsWith(prefix)) {
                    newRow[key.substring(prefix.length)] = row[key]
                } else {
                    newRow[key] = row[key]
                }
            }
            return newRow
        })
    }

    private processRelationResults(rawResults: any[]): any[] {
        if (!rawResults.length) return []

        const mainTablePks = Object.values(this.table._.columns)
            .filter((c) => c.options.primaryKey)
            .map((c) => c._.name)
        if (mainTablePks.length === 0) {
            // Cannot group results without a primary key
            return rawResults
        }

        const groupedResults: Map<string, any> = new Map()

        for (const row of rawResults) {
            const mainTableKey = mainTablePks.map((pk) => row[`${this.selectedTableAlias}.${pk}`] ?? row[pk]).join('_')
            if (!groupedResults.has(mainTableKey)) {
                groupedResults.set(mainTableKey, {})
            }

            const result = groupedResults.get(mainTableKey)!
            const relations: any = {}

            // Process each column in the row
            for (const [key, value] of Object.entries(row)) {
                if (key.includes('.')) {
                    const [tableAlias, columnName] = key.split('.')

                    if (tableAlias === this.selectedTableAlias) {
                        result[columnName] = value
                    } else {
                        const parts = tableAlias.split('_')
                        if (parts.length >= 2 && parts[0] === this.selectedTableAlias) {
                            const relationName = parts.slice(1).join('_')
                            if (!relations[relationName]) relations[relationName] = {}
                            relations[relationName][columnName] = value
                        } else {
                            if (!result[tableAlias]) result[tableAlias] = {}
                            result[tableAlias][columnName] = value
                        }
                    }
                } else {
                    result[key] = value
                }
            }

            // Attach relations, handling one vs many
            for (const [relName, relData] of Object.entries(relations)) {
                const relationConfig = this.table.relations[relName]
                if (!relationConfig) continue

                const hasData = Object.values(relData as Record<string, any>).some(
                    (v) => v !== null && v !== undefined && v !== ''
                )
                if (!hasData) continue

                if (relationConfig.type === 'many') {
                    if (!result[relName]) result[relName] = []
                    // Avoid pushing duplicate related objects if the join results in multiple rows for the same related entity
                    const relatedPks = Object.values(relationConfig.foreignTable._.columns)
                        .filter((c) => c.options.primaryKey)
                        .map((c) => c._.name)
                    const relDataKey = relatedPks.map((pk) => (relData as any)[pk]).join('_')
                    if (
                        relatedPks.length === 0 ||
                        !result[relName].some((r: any) => relatedPks.map((pk) => r[pk]).join('_') === relDataKey)
                    ) {
                        result[relName].push(relData)
                    }
                } else {
                    // 'one'
                    result[relName] = relData
                }
            }
        }
        return Array.from(groupedResults.values())
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
