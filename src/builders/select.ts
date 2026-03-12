import { Expression, Kysely, sql, SqlBool } from 'kysely'
import { Condition } from '../operators'
import { AnySQLiteColumn, AnyTable, InferSelectModel } from '../types'
import { deserializeValue } from '../serialization'

/** Map DB column names to TypeScript property names for a table */
function getDbNameToTsName(table: AnyTable): Record<string, string> {
    const map: Record<string, string> = {}
    for (const [tsName, col] of Object.entries(table._.columns)) {
        map[col._.name] = tsName
    }
    return map
}

/** Normalize result key - SQLite may return quoted aliases like "users.id" */
function normalizeRowKey(key: string): string {
    if (key.startsWith('"') && key.endsWith('"')) {
        return key.slice(1, -1)
    }
    return key
}

/** Resolve which columns to select for a relation. Always includes primary keys for deduplication. */
function resolveRelationColumns(table: AnyTable, include: NestedInclude): AnySQLiteColumn[] {
    const allEntries = Object.entries(table._.columns)
    if (include === true || typeof include !== 'object') {
        return allEntries.map(([, col]) => col)
    }
    const cols = include.columns
    if (!cols) {
        return allEntries.map(([, col]) => col)
    }
    const names: string[] = Array.isArray(cols)
        ? cols
        : Object.entries(cols)
              .filter(([, v]) => v)
              .map(([k]) => k)
    const pkNames = allEntries
        .filter(([, c]) => c.options.primaryKey)
        .map(([k]) => k)
    const combined = new Set([...names, ...pkNames])
    return allEntries
        .filter(([tsName]) => combined.has(tsName))
        .map(([, col]) => col)
}

type NestedInclude = boolean | {
    columns?: string[] | Record<string, boolean>
    with?: Record<string, NestedInclude>
}

type ExtractRelationNames<T extends AnyTable> = T['relations'] extends Record<string, any>
    ? keyof T['relations'] & string
    : never

type IncludeRelations<T extends AnyTable> = T['relations'] extends Record<string, any>
    ? Partial<Record<ExtractRelationNames<T>, NestedInclude>>
    : Record<string, never>

export class SelectQueryBuilder<
    TTable extends AnyTable,
    TSelectedColumns extends (keyof TTable['_']['columns'])[] | undefined = undefined
> {
    private _builder: any
    private _table: TTable
    private _columns?: TSelectedColumns
    private _includeRelations: IncludeRelations<TTable> = {} as IncludeRelations<TTable>
    private _manualJoins: Array<{
        type: 'LEFT' | 'INNER' | 'RIGHT'
        table: AnyTable
        condition: Expression<SqlBool>
        alias: string
    }> = []
    private _isDistinct = false
    private _includedColumnAliases: string[] = []

    constructor(private readonly kysely: Kysely<any>, table: TTable, columns?: TSelectedColumns) {
        this._table = table
        this._columns = columns

        const selected = columns
            ? columns.map((c) => table._.columns[c as string])
            : Object.values(table._.columns)

        const colSelections = selected.map(
            (col) => `${table._.name}.${col._.name} as "${table._.name}.${col._.name}"`
        )
        this._includedColumnAliases = colSelections

        this._builder = kysely.selectFrom(table._.name).select(colSelections as any)
    }

    distinct(): this {
        this._isDistinct = true
        this._builder = this._builder.distinct()
        return this
    }

    where(condition: Condition): this {
        this._builder = this._builder.where(condition)
        return this
    }

    orderBy(
        column: AnySQLiteColumn | Expression<any>,
        direction: 'asc' | 'desc' = 'asc'
    ): this {
        if ('toOperationNode' in column) {
            this._builder = this._builder.orderBy(column as Expression<any>, direction)
        } else {
            this._builder = this._builder.orderBy(
                sql.ref((column as AnySQLiteColumn)._.name),
                direction
            )
        }
        return this
    }

    limit(count: number): this {
        this._builder = this._builder.limit(count)
        return this
    }

    offset(count: number): this {
        this._builder = this._builder.offset(count)
        return this
    }

    groupBy(...columns: AnySQLiteColumn[]): this {
        for (const col of columns) {
            this._builder = this._builder.groupBy(
                sql`${sql.ref(this._table._.name)}.${sql.ref(col._.name)}`
            )
        }
        return this
    }

    having(condition: Condition): this {
        this._builder = this._builder.having(condition)
        return this
    }

    leftJoin<T extends AnyTable>(table: T, condition: Expression<SqlBool>, alias: string): this {
        this._manualJoins.push({ type: 'LEFT', table, condition, alias })
        const aliasedCols = Object.values(table._.columns).map(
            (col) => `${alias}.${col._.name} as "${alias}.${col._.name}"`
        )
        this._builder = this._builder
            .leftJoin(`${table._.name} as ${alias}`, (join: any) => join.on(condition))
            .select(aliasedCols as any)
        return this
    }

    innerJoin<T extends AnyTable>(table: T, condition: Expression<SqlBool>, alias: string): this {
        this._manualJoins.push({ type: 'INNER', table, condition, alias })
        const aliasedCols = Object.values(table._.columns).map(
            (col) => `${alias}.${col._.name} as "${alias}.${col._.name}"`
        )
        this._builder = this._builder
            .innerJoin(`${table._.name} as ${alias}`, (join: any) => join.on(condition))
            .select(aliasedCols as any)
        return this
    }

    include(relations: IncludeRelations<TTable>): this {
        this._includeRelations = { ...this._includeRelations, ...relations }
        return this
    }

    private applyIncludes(): void {
        const processRelations = (
            parentTable: AnyTable,
            parentAlias: string,
            relations: Record<string, NestedInclude>,
            depth: number = 0
        ) => {
            if (depth > 10) {
                console.warn('[Tauri-ORM] Maximum relation depth (10) exceeded.')
                return
            }

            for (const [relationName, include] of Object.entries(relations)) {
                if (!include) continue

                const relation = parentTable.relations[relationName]
                if (!relation) {
                    console.warn(
                        `[Tauri-ORM] Relation "${relationName}" not found on table "${parentTable._.name}". Skipping.`
                    )
                    continue
                }

                const foreignTable = relation.foreignTable
                const foreignAlias = `${parentAlias}_${relationName}`

                const selectedCols = resolveRelationColumns(foreignTable, include)
                const aliasedCols = selectedCols.map(
                    (col) => `${foreignAlias}.${col._.name} as "${foreignAlias}.${col._.name}"`
                )

                if (relation.type === 'one' && relation.fields && relation.references) {
                    const onCondition = sql<SqlBool>`${sql.join(
                        relation.fields.map((field, i) =>
                            sql`${sql.ref(`${parentAlias}.${field._.name}`)} = ${sql.ref(`${foreignAlias}.${relation.references![i]._.name}`)}`
                        ),
                        sql` AND `
                    )}`
                    this._builder = this._builder
                        .leftJoin(
                            `${foreignTable._.name} as ${foreignAlias}`,
                            (join: any) => join.on(onCondition)
                        )
                        .select(aliasedCols as any)
                } else if (relation.type === 'many') {
                    const refRelation = Object.entries(foreignTable.relations).find(
                        ([, r]) => r.foreignTable === parentTable
                    )
                    if (refRelation && refRelation[1].fields && refRelation[1].references) {
                        const [, relationConfig] = refRelation
                        const onCondition = sql<SqlBool>`${sql.join(
                            relationConfig.fields!.map((field, i) =>
                                sql`${sql.ref(`${foreignAlias}.${field._.name}`)} = ${sql.ref(`${parentAlias}.${relationConfig.references![i]._.name}`)}`
                            ),
                            sql` AND `
                        )}`
                        this._builder = this._builder
                            .leftJoin(
                                `${foreignTable._.name} as ${foreignAlias}`,
                                (join: any) => join.on(onCondition)
                            )
                            .select(aliasedCols as any)
                    }
                }

                if (typeof include === 'object' && include.with) {
                    processRelations(foreignTable, foreignAlias, include.with, depth + 1)
                }
            }
        }

        processRelations(this._table, this._table._.name, this._includeRelations as any, 0)
    }

    async execute(): Promise<InferSelectModel<TTable>[]> {
        this.applyIncludes()
        const rawResults = await this._builder.execute()

        const hasIncludes = Object.values(this._includeRelations).some((i) => i)
        if (hasIncludes) {
            return this.processRelationResults(rawResults) as InferSelectModel<TTable>[]
        }

        const hasManualJoins = this._manualJoins.length > 0
        if (hasManualJoins) {
            return rawResults as InferSelectModel<TTable>[]
        }

        const prefix = `${this._table._.name}.`
        const dbNameToTs = getDbNameToTsName(this._table)
        return rawResults.map((row: any) => {
            const out: Record<string, any> = {}
            for (const key in row) {
                const normKey = normalizeRowKey(key)
                const dbColName = normKey.startsWith(prefix) ? normKey.slice(prefix.length) : normKey
                const tsName = dbNameToTs[dbColName] ?? dbColName
                const column = this._table._.columns[tsName]
                out[tsName] = column ? deserializeValue(row[key], column) : row[key]
            }
            return out
        }) as InferSelectModel<TTable>[]
    }

    private processRelationResults(rawResults: any[]): any[] {
        if (!rawResults.length) return []

        const mainTablePks = Object.values(this._table._.columns)
            .filter((c) => c.options.primaryKey)
            .map((c) => c._.name)

        if (mainTablePks.length === 0) return rawResults

        const groupedResults = new Map<string, any>()

        const parseRelationPath = (tableAlias: string, baseAlias: string): string[] => {
            if (!tableAlias.startsWith(baseAlias + '_')) return []
            return tableAlias.slice(baseAlias.length + 1).split('_')
        }

        const setNestedValue = (obj: any, path: string[], columnName: string, value: any) => {
            let cur = obj
            for (let i = 0; i < path.length; i++) {
                const key = path[i]
                if (i === path.length - 1) {
                    if (!cur[key]) cur[key] = {}
                    cur[key][columnName] = value
                } else {
                    if (!cur[key]) cur[key] = {}
                    cur = cur[key]
                }
            }
        }

        const getNestedRelation = (table: AnyTable, path: string[]): any => {
            let current = table
            let relation: any = null
            for (const name of path) {
                relation = current.relations[name]
                if (!relation) return null
                current = relation.foreignTable
            }
            return relation
        }

        for (const row of rawResults) {
            const getVal = (logicalKey: string) => {
                const quoted = `"${logicalKey}"`
                return row[quoted] ?? row[logicalKey]
            }
            const mainTableKey = mainTablePks
                .map((pk) => getVal(`${this._table._.name}.${pk}`) ?? getVal(pk))
                .join('_')

            if (!groupedResults.has(mainTableKey)) {
                groupedResults.set(mainTableKey, {})
            }

            const result = groupedResults.get(mainTableKey)!
            const relations: any = {}

            for (const [key, value] of Object.entries(row)) {
                const normKey = normalizeRowKey(key)
                if (!normKey.includes('.')) {
                    const mainDbToTs = getDbNameToTsName(this._table)
                    const tsName = mainDbToTs[normKey] ?? normKey
                    const column = this._table._.columns[tsName]
                    result[tsName] = column ? deserializeValue(value, column) : value
                    continue
                }

                const dotIndex = normKey.indexOf('.')
                const tableAlias = normKey.slice(0, dotIndex)
                const columnName = normKey.slice(dotIndex + 1)

                if (tableAlias === this._table._.name) {
                    const mainDbToTs = getDbNameToTsName(this._table)
                    const tsName = mainDbToTs[columnName] ?? columnName
                    const column = this._table._.columns[tsName]
                    result[tsName] = column ? deserializeValue(value, column) : value
                } else {
                    const path = parseRelationPath(tableAlias, this._table._.name)
                    if (path.length > 0) {
                        const relationConfig = getNestedRelation(this._table, path)
                        const foreignTable = relationConfig?.foreignTable
                        const foreignDbToTs = foreignTable ? getDbNameToTsName(foreignTable) : {}
                        const tsName = foreignDbToTs[columnName] ?? columnName
                        const col = foreignTable?._.columns?.[tsName]
                        setNestedValue(relations, path, tsName, col ? deserializeValue(value, col) : value)
                    } else {
                        if (!result[tableAlias]) result[tableAlias] = {}
                        result[tableAlias][columnName] = value
                    }
                }
            }

            const attachRelations = (target: any, relData: any, table: AnyTable) => {
                for (const [relName, data] of Object.entries(relData)) {
                    const relationConfig = table.relations[relName]
                    if (!relationConfig) continue

                    const directData: any = {}
                    const nestedData: any = {}

                    if (typeof data === 'object' && data !== null) {
                        for (const [k, v] of Object.entries(data as any)) {
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

                    if (relationConfig.type === 'many') {
                        if (!target[relName]) target[relName] = []
                        if (hasData) {
                            const relPks = Object.values(relationConfig.foreignTable._.columns)
                                .filter((c: any) => c.options.primaryKey)
                                .map((c: any) => c._.name)
                            const key = relPks.map((pk) => directData[pk]).join('_')
                            if (
                                relPks.length === 0 ||
                                !target[relName].some(
                                    (r: any) => relPks.map((pk) => r[pk]).join('_') === key
                                )
                            ) {
                                const newItem = { ...directData }
                                if (Object.keys(nestedData).length > 0) {
                                    attachRelations(newItem, nestedData, relationConfig.foreignTable)
                                }
                                target[relName].push(newItem)
                            }
                        }
                    } else {
                        if (hasData || Object.keys(nestedData).length > 0) {
                            target[relName] = { ...directData }
                            if (Object.keys(nestedData).length > 0) {
                                attachRelations(
                                    target[relName],
                                    nestedData,
                                    relationConfig.foreignTable
                                )
                            }
                        }
                    }
                }
            }

            attachRelations(result, relations, this._table)
        }

        return Array.from(groupedResults.values())
    }

    async all(): Promise<InferSelectModel<TTable>[]> {
        return this.execute()
    }

    async get(): Promise<InferSelectModel<TTable> | undefined> {
        this.limit(1)
        const result = await this.execute()
        return result[0]
    }

    async first(): Promise<InferSelectModel<TTable> | undefined> {
        return this.get()
    }

    async exists(): Promise<boolean> {
        this.applyIncludes()
        const compiledResult = await this._builder
            .clearSelect()
            .select(sql.raw('1').as('__exists__'))
            .limit(1)
            .execute()
        return compiledResult.length > 0
    }

    async count(): Promise<number> {
        this.applyIncludes()
        const result = await this._builder
            .clearSelect()
            .select(sql<number>`COUNT(*)`.as('count'))
            .execute()
        const row = result[0] as Record<string, any> | undefined
        const val = row ? (row['"count"'] ?? row.count) : undefined
        return Number(val ?? 0)
    }

    async pluck<K extends keyof TTable['_']['columns']>(
        column: K
    ): Promise<InferSelectModel<TTable>[K][]> {
        this.applyIncludes()
        const col = this._table._.columns[column as string]
        const alias = col._.name
        const results = await this._builder
            .clearSelect()
            .select(
                sql.raw(`${this._table._.name}.${alias}`).as(alias)
            )
            .execute()
        return results.map((row: any) => {
            const val = row['"' + alias + '"'] ?? row[alias]
            return col ? deserializeValue(val, col) : val
        }) as InferSelectModel<TTable>[K][]
    }

    async paginate(
        page: number = 1,
        pageSize: number = 10
    ): Promise<{
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

        const total = await this.count()
        const totalPages = Math.ceil(total / pageSize)
        const offset = (page - 1) * pageSize
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
        this.applyIncludes()
        const compiled = this._builder.compile()
        return { sql: compiled.sql, params: [...compiled.parameters] }
    }

    toKyselyExpression(): Expression<any> {
        this.applyIncludes()
        return this._builder
    }
}
