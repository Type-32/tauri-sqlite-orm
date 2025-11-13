import { BaseQueryBuilder } from './query-base'
import Database from '@tauri-apps/plugin-sql'
import { and, eq } from '../operators'
import { SQLCondition } from '../orm'
import { AnySQLiteColumn, AnyTable, InferSelectModel } from '../types'
import { deserializeValue } from '../serialization'

// Type for nested includes with better inference
type NestedInclude = boolean | { with?: Record<string, NestedInclude> }

// Extract relation names from a table for better autocomplete
type ExtractRelationNames<T extends AnyTable> = T['relations'] extends Record<string, any>
    ? keyof T['relations'] & string
    : never

type IncludeRelations<T extends AnyTable> = T['relations'] extends Record<string, any>
    ? Partial<Record<ExtractRelationNames<T>, NestedInclude>>
    : Record<string, never>

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
    private includeRelations: IncludeRelations<TTable> = {}
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

    include(relations: IncludeRelations<TTable>): this {
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

        // Then handle relations recursively
        const processRelations = (
            parentTable: AnyTable,
            parentAlias: string,
            relations: IncludeRelations<any>,
            depth: number = 0
        ) => {
            // Prevent infinite recursion
            if (depth > 10) {
                console.warn('[Tauri-ORM] Maximum relation depth (10) exceeded. Skipping deeper relations.')
                return
            }

            for (const [relationName, include] of Object.entries(relations)) {
            if (!include) continue

                const relation = parentTable.relations[relationName]
            if (!relation) {
                console.warn(
                        `[Tauri-ORM] Relation "${relationName}" not found on table "${parentTable._.name}". Skipping include.`
                )
                continue
            }

            const foreignTable = relation.foreignTable
                const foreignAlias = `${parentAlias}_${relationName}`

            const aliasedColumns = Object.values(foreignTable._.columns).map(
                (col) => `${foreignAlias}.${col._.name} AS "${foreignAlias}.${col._.name}"`
            )
            this.selectedColumns.push(...aliasedColumns)

            if (relation.type === 'one' && relation.fields && relation.references) {
                    // One-to-one or many-to-one: parent table references foreign table
                const conditions = relation.fields.map((field, i) => {
                        const localColumn = `${parentAlias}.${field._.name}`
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
                    // One-to-many: foreign table references parent table
                const refRelation = Object.entries(foreignTable.relations).find(
                        ([_, r]) => r.foreignTable === parentTable
                )

                if (refRelation && refRelation[1].fields && refRelation[1].references) {
                    const [_, relationConfig] = refRelation
                    const conditions = relationConfig.fields!.map((field, i) => {
                        const localColumn = `${foreignAlias}.${field._.name}`
                            const foreignColumn = `${parentAlias}.${relationConfig.references![i]._.name}`
                        return {
                            sql: `${localColumn} = ${foreignColumn}`,
                            params: [],
                        }
                    })
                    const condition = conditions.length > 1 ? and(...conditions) : conditions[0]

                    sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${condition.sql}`
                    params.push(...condition.params)
                }
                } else if (relation.type === 'manyToMany' && relation.junctionTable && relation.junctionFields && relation.junctionReferences) {
                    // Many-to-many: join through junction table
                    const junctionTable = relation.junctionTable
                    const junctionAlias = `${foreignAlias}_junction`

                    // First, join the junction table
                    // Get the primary key(s) of the parent table to link with junction
                    const parentTablePks = Object.values(parentTable._.columns)
                        .filter((c) => c.options.primaryKey)
                        .map((c) => c._.name)

                    if (parentTablePks.length > 0 && relation.junctionFields.length > 0) {
                        const junctionConditions = relation.junctionFields.map((field, i) => {
                            const parentPk = parentTablePks[i] || parentTablePks[0] // fallback to first PK
                            const localColumn = `${parentAlias}.${parentPk}`
                            const junctionColumn = `${junctionAlias}.${field._.name}`
                            return {
                                sql: `${localColumn} = ${junctionColumn}`,
                                params: [],
                            }
                        })
                        const junctionCondition = junctionConditions.length > 1 ? and(...junctionConditions) : junctionConditions[0]

                        sql += ` LEFT JOIN ${junctionTable._.name} ${junctionAlias} ON ${junctionCondition.sql}`
                        params.push(...junctionCondition.params)

                        // Then, join the target table through the junction table
                        const foreignTablePks = Object.values(foreignTable._.columns)
                            .filter((c) => c.options.primaryKey)
                            .map((c) => c._.name)

                        if (foreignTablePks.length > 0 && relation.junctionReferences.length > 0) {
                            const foreignConditions = relation.junctionReferences.map((field, i) => {
                                const foreignPk = foreignTablePks[i] || foreignTablePks[0]
                                const junctionColumn = `${junctionAlias}.${field._.name}`
                                const foreignColumn = `${foreignAlias}.${foreignPk}`
                                return {
                                    sql: `${junctionColumn} = ${foreignColumn}`,
                                    params: [],
                                }
                            })
                            const foreignCondition = foreignConditions.length > 1 ? and(...foreignConditions) : foreignConditions[0]

                            sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${foreignCondition.sql}`
                            params.push(...foreignCondition.params)
                        }
                    }
                }

                // Process nested includes
                if (typeof include === 'object' && include.with) {
                    processRelations(foreignTable, foreignAlias, include.with, depth + 1)
                }
            }
        }

        // Start processing from the main table
        processRelations(this.table, this.selectedTableAlias, this.includeRelations, 0)

        return { sql, params }
    }

    // Enhanced execute method that handles relation data mapping
    async execute(): Promise<InferSelectModel<TTable>[]> {
        const { sql: joinSql, params: joinParams } = this.buildJoins()

        const distinct = this.isDistinct ? 'DISTINCT ' : ''
        this.query = `SELECT ${distinct}${this.selectedColumns.join(', ')} ${this.query}`
        this.query += joinSql
        this.params.push(...joinParams)

        const { sql, params } = this.build()

        const rawResults = await this.db.select<any[]>(sql, params)

        const hasIncludes = Object.values(this.includeRelations).some((i) => i)
        if (hasIncludes) {
            return this.processRelationResults(rawResults) as InferSelectModel<TTable>[]
        }

        const hasJoins = this.joins.length > 0
        if (hasJoins) {
            return rawResults as InferSelectModel<TTable>[]
        }

        // Strip prefixes and deserialize for simple queries
        const prefix = `${this.selectedTableAlias}.`
        return rawResults.map((row) => {
            const newRow: Record<string, any> = {}
            for (const key in row) {
                const columnName = key.startsWith(prefix) ? key.substring(prefix.length) : key
                const column = this.table._.columns[columnName]
                
                if (column) {
                    newRow[columnName] = deserializeValue(row[key], column)
                } else {
                    newRow[columnName] = row[key]
                }
            }
            return newRow
        }) as InferSelectModel<TTable>[]
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

        // Helper to parse nested relation data from column keys
        const parseRelationPath = (tableAlias: string, baseAlias: string): string[] => {
            if (!tableAlias.startsWith(baseAlias + '_')) {
                return []
            }
            const path = tableAlias.substring(baseAlias.length + 1)
            return path.split('_')
        }

        // Helper to set nested value in object
        const setNestedValue = (obj: any, path: string[], value: any, columnName: string) => {
            let current = obj
            for (let i = 0; i < path.length; i++) {
                const key = path[i]
                if (i === path.length - 1) {
                    // Last key - set the column value
                    if (!current[key]) current[key] = {}
                    current[key][columnName] = value
                } else {
                    // Intermediate key
                    if (!current[key]) current[key] = {}
                    current = current[key]
                }
            }
        }

        // Helper to get nested relation config
        const getNestedRelation = (table: AnyTable, path: string[]): any => {
            let currentTable = table
            let currentRelation = null
            
            for (const relationName of path) {
                currentRelation = currentTable.relations[relationName]
                if (!currentRelation) return null
                currentTable = currentRelation.foreignTable
            }
            
            return currentRelation
        }

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
                        // Deserialize main table column
                        const column = this.table._.columns[columnName]
                        result[columnName] = column ? deserializeValue(value, column) : value
                    } else {
                        const relationPath = parseRelationPath(tableAlias, this.selectedTableAlias)
                        if (relationPath.length > 0) {
                            // For nested relations, find the column in the foreign table
                            const relationConfig = getNestedRelation(this.table, relationPath)
                            const column = relationConfig?.foreignTable?._.columns?.[columnName]
                            const deserializedValue = column ? deserializeValue(value, column) : value
                            setNestedValue(relations, relationPath, deserializedValue, columnName)
                        } else {
                            if (!result[tableAlias]) result[tableAlias] = {}
                            result[tableAlias][columnName] = value
                        }
                    }
                } else {
                    // Column without alias - try to find in main table
                    const column = this.table._.columns[key]
                    result[key] = column ? deserializeValue(value, column) : value
                }
            }

            // Recursively attach relations
            const attachRelations = (target: any, relationsData: any, table: AnyTable, pathPrefix: string[] = []) => {
                for (const [relName, relData] of Object.entries(relationsData)) {
                    const currentPath = [...pathPrefix, relName]
                    const relationConfig = getNestedRelation(table, currentPath)
                    
                if (!relationConfig) continue

                    // Check if this relation has data
                    const hasDirectData = typeof relData === 'object' && relData !== null &&
                        Object.entries(relData as Record<string, any>).some(([k, v]) => {
                            // If the key is a column name (not a nested relation), check if it has data
                            return typeof v !== 'object' && v !== null && v !== undefined && v !== ''
                        })

                    if (!hasDirectData && typeof relData === 'object' && relData !== null) {
                        // This might be a nested relation container
                        // Check if any nested relations have data
                        const hasNestedData = Object.values(relData as Record<string, any>).some(v => 
                            typeof v === 'object' && v !== null && Object.keys(v as Record<string, any>).length > 0
                        )
                        if (!hasNestedData) continue
                    }

                    if (relationConfig.type === 'many' || relationConfig.type === 'manyToMany') {
                        if (!target[relName]) target[relName] = []
                        
                        // Extract direct column data
                        const directData: any = {}
                        const nestedData: any = {}
                        
                        if (typeof relData === 'object' && relData !== null) {
                            for (const [k, v] of Object.entries(relData as Record<string, any>)) {
                                if (typeof v === 'object' && v !== null) {
                                    nestedData[k] = v
                                } else {
                                    directData[k] = v
                                }
                            }
                        }

                        // Check if we have actual data
                        const hasData = Object.values(directData).some(
                    (v) => v !== null && v !== undefined && v !== ''
                )

                        if (hasData) {
                    const relatedPks = Object.values(relationConfig.foreignTable._.columns)
                                .filter((c: any) => c.options.primaryKey)
                                .map((c: any) => c._.name)
                            const relDataKey = relatedPks.map((pk) => directData[pk]).join('_')
                            
                    if (
                        relatedPks.length === 0 ||
                                !target[relName].some((r: any) => relatedPks.map((pk) => r[pk]).join('_') === relDataKey)
                    ) {
                                const newItem = { ...directData }
                                // Recursively attach nested relations
                                if (Object.keys(nestedData).length > 0) {
                                    attachRelations(newItem, nestedData, relationConfig.foreignTable, [])
                                }
                                target[relName].push(newItem)
                            }
                    }
                } else {
                        // 'one' relation
                        const directData: any = {}
                        const nestedData: any = {}
                        
                        if (typeof relData === 'object' && relData !== null) {
                            for (const [k, v] of Object.entries(relData as Record<string, any>)) {
                                if (typeof v === 'object' && v !== null) {
                                    nestedData[k] = v
                                } else {
                                    directData[k] = v
                                }
                            }
                        }

                        const hasData = Object.values(directData).some(
                            (v) => v !== null && v !== undefined && v !== ''
                        )

                        if (hasData || Object.keys(nestedData).length > 0) {
                            target[relName] = { ...directData }
                            // Recursively attach nested relations
                            if (Object.keys(nestedData).length > 0) {
                                attachRelations(target[relName], nestedData, relationConfig.foreignTable, [])
                }
            }
                    }
                }
            }

            attachRelations(result, relations, this.table)
        }
        return Array.from(groupedResults.values())
    }

    // Update the return type signatures
    async all(): Promise<InferSelectModel<TTable>[]> {
        return this.execute()
    }

    async get(): Promise<InferSelectModel<TTable> | undefined> {
        this.limit(1)
        const result = await this.execute()
        return result[0]
    }

    async exists(): Promise<boolean> {
        // Use SELECT 1 for efficiency - we only care if rows exist
        const originalColumns = this.selectedColumns
        this.selectedColumns = ['1']
        
        const { sql: joinSql, params: joinParams } = this.buildJoins()
        
        // Build query with LIMIT 1 for efficiency
        const query = `SELECT 1 ${this.query}${joinSql} LIMIT 1`
        const params = [...this.params, ...joinParams]
        
        // Restore original columns
        this.selectedColumns = originalColumns
        
        const result = await this.db.select<any[]>(query, params)
        return result.length > 0
    }

    async count(): Promise<number> {
        // Build COUNT(*) query
        const originalColumns = this.selectedColumns
        this.selectedColumns = ['COUNT(*) as count']
        
        const { sql: joinSql, params: joinParams } = this.buildJoins()
        
        const query = `SELECT COUNT(*) as count ${this.query}${joinSql}`
        const params = [...this.params, ...joinParams]
        
        // Restore original columns
        this.selectedColumns = originalColumns
        
        const result = await this.db.select<{ count: number }[]>(query, params)
        return result[0]?.count || 0
    }

    async first(): Promise<InferSelectModel<TTable> | undefined> {
        // Alias for get() with better semantics
        return this.get()
    }

    async pluck<K extends keyof TTable['_']['columns']>(
        column: K
    ): Promise<InferSelectModel<TTable>[K][]> {
        // Get array of values from a single column
        const columnName = this.table._.columns[column as string]._.name
        const originalColumns = this.selectedColumns
        this.selectedColumns = [`${this.selectedTableAlias}.${columnName} AS "${columnName}"`]
        
        const { sql: joinSql, params: joinParams } = this.buildJoins()
        
        const query = `SELECT ${this.selectedColumns.join(', ')} ${this.query}${joinSql}`
        const params = [...this.params, ...joinParams]
        
        // Restore original columns
        this.selectedColumns = originalColumns
        
        const results = await this.db.select<any[]>(query, params)
        return results.map(row => row[columnName]) as InferSelectModel<TTable>[K][]
    }

    async paginate(page: number = 1, pageSize: number = 10): Promise<{
        data: InferSelectModel<TTable>[]
        total: number
        page: number
        pageSize: number
        totalPages: number
        hasNextPage: boolean
        hasPrevPage: boolean
    }> {
        if (page < 1) page = 1
        if (pageSize < 1) pageSize = 10

        // Get total count
        const total = await this.count()
        
        // Calculate pagination
        const totalPages = Math.ceil(total / pageSize)
        const offset = (page - 1) * pageSize
        
        // Get paginated data
        const data = await this.limit(pageSize).offset(offset).all()
        
        return {
            data,
            total,
            page,
            pageSize,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        }
    }

    toSQL(): { sql: string; params: any[] } {
        const { sql: joinSql, params: joinParams } = this.buildJoins()

        const distinct = this.isDistinct ? 'DISTINCT ' : ''
        const finalQuery = `SELECT ${distinct}${this.selectedColumns.join(', ')} ${this.query}${joinSql}`

        return {
            sql: finalQuery,
            params: [...this.params, ...joinParams],
        }
    }
}
