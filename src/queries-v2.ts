/**
 * EXPERIMENTAL — Relational Query Builder v2 (Drizzle-style `db.query`).
 *
 * This module is intentionally NOT exported from `src/index.ts`. It is a
 * self-contained experiment: nothing in the public API depends on it, and it
 * does not affect the published bundle, type declarations, or build when unused.
 *
 * Import it directly for experimentation:
 *   import { relationalQuery } from '<pkg>/src/queries-v2'
 *
 * Supported:
 *   - query.<table>.findMany() / findFirst()
 *   - object `where` (equality, operators, AND / OR / NOT / RAW)
 *   - filtering by relations: `where: { posts: { content: { like: 'M%' } } }`
 *     (compiles to a correlated EXISTS subquery)
 *   - object `orderBy` ({ column: 'asc' | 'desc' })
 *   - `with` for relations, with per-relation `where` (SQL join filter),
 *     `orderBy` / `limit` / `offset` (applied post-query — see note below)
 *   - $count(table, filter)
 *
 * Not yet supported: `extras`, and result typing that reflects loaded relations
 * (`findMany` returns the base model type; relations are present at runtime only).
 *
 * ponytail: per-relation `orderBy`/`limit`/`offset` are applied in JS after the
 * query (all matching rows are fetched, then sorted/sliced) rather than via
 * window functions. Correct, but not optimal — revisit if large relation sets
 * become a perf issue.
 */

import { sql, type SqlBool } from 'kysely'
import { AnySQLiteColumn, AnyTable, RelationConfig, InferSelectModel } from './types'
import { TauriORM } from './orm'
import { SelectQueryBuilder } from './builders'
import { and, or, not, type Condition } from './operators'
import { serializeValue } from './serialization'

/** Known operator keys on a column filter value. */
const OPERATOR_KEYS = [
    'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike',
    'inArray', 'notInArray',
    'between',
    'isNull', 'isNotNull',
    'contains', 'startsWith', 'endsWith',
] as const

/** Operator object for a single column. */
export type SQLOperator = {
    eq?: unknown
    ne?: unknown
    gt?: unknown
    gte?: unknown
    lt?: unknown
    lte?: unknown
    like?: string
    ilike?: string
    inArray?: unknown[]
    notInArray?: unknown[]
    between?: [unknown, unknown]
    isNull?: boolean
    isNotNull?: boolean
    contains?: string
    startsWith?: string
    endsWith?: string
}

/**
 * Object filter. Column keys map to a value or operator object; relation keys
 * (defined via defineRelations) map to a nested filter and compile to an EXISTS
 * subquery; AND/OR/NOT/RAW compose. Loose on purpose (experimental).
 */
export type SQLFilter<T extends AnyTable = AnyTable> = {
    AND?: SQLFilter<T>[]
    OR?: SQLFilter<T>[]
    NOT?: SQLFilter<T>
    RAW?: (columns: T['_']['columns']) => Condition
} & Record<string, unknown>

/** Shape of `with` — extends the `.include()` shape with per-relation filters. */
export type RelationalWith = boolean | {
    columns?: string[] | Record<string, boolean>
    with?: Record<string, RelationalWith>
    where?: SQLFilter
    orderBy?: Record<string, 'asc' | 'desc'>
    limit?: number
    offset?: number
}

export type RelationalQueryOptions<T extends AnyTable> = {
    where?: SQLFilter<T>
    orderBy?: Partial<Record<keyof T['_']['columns'], 'asc' | 'desc'>>
    with?: Record<string, RelationalWith>
    limit?: number
    offset?: number
}

export type RelationalTableQuery<T extends AnyTable> = {
    findMany(opts?: RelationalQueryOptions<T>): Promise<InferSelectModel<T>[]>
    findFirst(opts?: RelationalQueryOptions<T>): Promise<InferSelectModel<T> | undefined>
}

export type RelationalQuery<TTables extends Record<string, AnyTable>> = {
    [K in keyof TTables]: RelationalTableQuery<TTables[K]>
}

type CountFn = <T extends AnyTable>(table: T, filter?: SQLFilter<T>) => Promise<number>

/** The experimental `db.query`-style API surface returned by `relationalQuery()`. */
export type RelationalQueryAPI<TTables extends Record<string, AnyTable>> = {
    query: RelationalQuery<TTables>
    $count: CountFn
}

function ref(alias: string | undefined, name: string) {
    return sql.ref(alias ? `${alias}.${name}` : name)
}

function isOperatorObject(v: unknown): v is SQLOperator {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
    const keys = Object.keys(v)
    return keys.length > 0 && keys.every((k) => (OPERATOR_KEYS as readonly string[]).includes(k))
}

function compileColumn(col: AnySQLiteColumn, value: unknown, alias?: string): Condition {
    const r = () => ref(alias, col._.name)

    if (value === null) return sql<SqlBool>`${r()} IS NULL`

    if (isOperatorObject(value)) {
        const parts: Condition[] = []
        if (value.eq !== undefined) parts.push(sql<SqlBool>`${r()} = ${sql.val(serializeValue(value.eq, col))}`)
        if (value.ne !== undefined) parts.push(sql<SqlBool>`${r()} != ${sql.val(serializeValue(value.ne, col))}`)
        if (value.gt !== undefined) parts.push(sql<SqlBool>`${r()} > ${sql.val(serializeValue(value.gt, col))}`)
        if (value.gte !== undefined) parts.push(sql<SqlBool>`${r()} >= ${sql.val(serializeValue(value.gte, col))}`)
        if (value.lt !== undefined) parts.push(sql<SqlBool>`${r()} < ${sql.val(serializeValue(value.lt, col))}`)
        if (value.lte !== undefined) parts.push(sql<SqlBool>`${r()} <= ${sql.val(serializeValue(value.lte, col))}`)
        if (value.like !== undefined) parts.push(sql<SqlBool>`${r()} LIKE ${sql.val(value.like)}`)
        if (value.ilike !== undefined) parts.push(sql<SqlBool>`${r()} LIKE ${sql.val(value.ilike)} COLLATE NOCASE`)
        if (value.inArray !== undefined) {
            const arr = value.inArray
            parts.push(
                arr.length === 0
                    ? sql<SqlBool>`1 = 0`
                    : sql<SqlBool>`${r()} IN (${sql.join(arr.map((v) => sql.val(serializeValue(v, col))))})`
            )
        }
        if (value.notInArray !== undefined) {
            const arr = value.notInArray
            parts.push(
                arr.length === 0
                    ? sql<SqlBool>`1 = 1`
                    : sql<SqlBool>`${r()} NOT IN (${sql.join(arr.map((v) => sql.val(serializeValue(v, col))))})`
            )
        }
        if (value.between !== undefined) {
            parts.push(
                sql<SqlBool>`${r()} BETWEEN ${sql.val(serializeValue(value.between[0], col))} AND ${sql.val(serializeValue(value.between[1], col))}`
            )
        }
        if (value.isNull === true) parts.push(sql<SqlBool>`${r()} IS NULL`)
        if (value.isNotNull === true) parts.push(sql<SqlBool>`${r()} IS NOT NULL`)
        if (value.contains !== undefined) parts.push(sql<SqlBool>`${r()} LIKE ${sql.val(`%${value.contains}%`)}`)
        if (value.startsWith !== undefined) parts.push(sql<SqlBool>`${r()} LIKE ${sql.val(`${value.startsWith}%`)}`)
        if (value.endsWith !== undefined) parts.push(sql<SqlBool>`${r()} LIKE ${sql.val(`%${value.endsWith}`)}`)
        return parts.length === 1 ? parts[0] : and(...parts)
    }

    return sql<SqlBool>`${r()} = ${sql.val(serializeValue(value, col))}`
}

/** Build a correlated EXISTS subquery filtering the parent by a relation. */
function compileRelationFilter(
    relation: RelationConfig,
    parentTable: AnyTable,
    parentAlias: string,
    subFilter: SQLFilter
): Condition {
    const foreignTable = relation.foreignTable
    const foreignAlias = foreignTable._.name
    const sub = compileFilter(subFilter, foreignTable, foreignAlias)

    if (relation.type === 'one' && relation.fields && relation.references) {
        const join = and(
            ...relation.fields.map((field, i) =>
                sql<SqlBool>`${ref(foreignAlias, relation.references![i]._.name)} = ${ref(parentAlias, field._.name)}`
            )
        )
        return sql<SqlBool>`EXISTS (SELECT 1 FROM ${sql.table(foreignAlias)} WHERE ${join} AND ${sub})`
    }

    if (relation.junctionTable && relation.fromJunction && relation.toJunction) {
        const junctionAlias = relation.junctionTable._.name
        const fromJ = relation.fromJunction
        const toJ = relation.toJunction
        const parentLink = sql<SqlBool>`${ref(junctionAlias, fromJ.junctionColumn._.name)} = ${ref(parentAlias, fromJ.column._.name)}`
        const foreignLink = sql<SqlBool>`${ref(foreignAlias, toJ.column._.name)} = ${ref(junctionAlias, toJ.junctionColumn._.name)}`
        return sql<SqlBool>`EXISTS (SELECT 1 FROM ${sql.table(junctionAlias)} WHERE ${parentLink} AND EXISTS (SELECT 1 FROM ${sql.table(foreignAlias)} WHERE ${foreignLink} AND ${sub}))`
    }

    // many: foreign.fields = parent.references. Back-references (no explicit
    // from/to) infer the join keys from the reverse `one` relation.
    let fields = relation.fields
    let references = relation.references
    if (!fields || !references) {
        const reverse = Object.values(foreignTable.relations).find(
            (r) => r.foreignTable === parentTable && r.type === 'one' && r.fields && r.references
        )
        if (reverse?.fields && reverse?.references) {
            fields = reverse.fields
            references = reverse.references
        }
    }
    if (fields && references) {
        const join = and(
            ...fields.map((field, i) =>
                sql<SqlBool>`${ref(foreignAlias, field._.name)} = ${ref(parentAlias, references![i]._.name)}`
            )
        )
        return sql<SqlBool>`EXISTS (SELECT 1 FROM ${sql.table(foreignAlias)} WHERE ${join} AND ${sub})`
    }

    throw new Error(`Cannot filter by relation on table "${parentTable._.name}" (no join keys)`)
}

/** Compile a Drizzle-v2-style object filter into a Kysely Condition. */
export function compileFilter(filter: SQLFilter, table: AnyTable, alias?: string): Condition {
    const tableAlias = alias ?? table._.name
    const parts: Condition[] = []
    for (const [key, value] of Object.entries(filter)) {
        if (key === 'AND') {
            parts.push(and(...(value as SQLFilter[]).map((f) => compileFilter(f, table, tableAlias))))
        } else if (key === 'OR') {
            parts.push(or(...(value as SQLFilter[]).map((f) => compileFilter(f, table, tableAlias))))
        } else if (key === 'NOT') {
            parts.push(not(compileFilter(value as SQLFilter, table, tableAlias)))
        } else if (key === 'RAW') {
            parts.push((value as (columns: AnyTable['_']['columns']) => Condition)(table._.columns))
        } else {
            const relation = table.relations[key]
            if (relation) {
                parts.push(compileRelationFilter(relation, table, tableAlias, value as SQLFilter))
            } else {
                const col = table._.columns[key]
                if (!col) throw new Error(`Unknown column or relation "${key}" in filter for table "${table._.name}"`)
                parts.push(compileColumn(col, value, tableAlias))
            }
        }
    }
    return parts.length === 1 ? parts[0] : and(...parts)
}

/** Convert user-facing `with` (object filters) into the `.include()`-compatible shape. */
function toIncludeWith(table: AnyTable, spec: Record<string, RelationalWith>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [relName, relSpec] of Object.entries(spec)) {
        if (relSpec === true || relSpec === false) {
            out[relName] = relSpec
            continue
        }
        const foreignTable = table.relations[relName]?.foreignTable
        const entry: Record<string, unknown> = {}
        if (relSpec.columns !== undefined) entry.columns = relSpec.columns
        if (relSpec.with !== undefined && foreignTable) entry.with = toIncludeWith(foreignTable, relSpec.with)
        if (relSpec.where !== undefined && foreignTable) {
            entry.where = (alias: string) => compileFilter(relSpec.where as SQLFilter, foreignTable, alias)
        }
        out[relName] = entry
    }
    return out
}

function compare(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0
    if (a == null) return -1
    if (b == null) return 1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
    const sa = String(a)
    const sb = String(b)
    return sa < sb ? -1 : sa > sb ? 1 : 0
}

function sortBySpec(
    arr: Record<string, unknown>[],
    table: AnyTable,
    orderBy: Record<string, 'asc' | 'desc'>
): Record<string, unknown>[] {
    const entries = Object.entries(orderBy).filter(([col]) => table._.columns[col] !== undefined)
    if (entries.length === 0) return arr
    return [...arr].sort((a, b) => {
        for (const [col, dir] of entries) {
            const cmp = compare(a[col], b[col])
            if (cmp !== 0) return dir === 'desc' ? -cmp : cmp
        }
        return 0
    })
}

/** Apply per-relation `orderBy`/`limit`/`offset` to already-assembled relation arrays. */
function postProcess(
    rows: Record<string, unknown>[],
    table: AnyTable,
    spec?: Record<string, RelationalWith>
): Record<string, unknown>[] {
    if (!spec) return rows
    for (const row of rows) {
        for (const [relName, relSpec] of Object.entries(spec)) {
            if (!relSpec || typeof relSpec === 'boolean') continue
            const relation = table.relations[relName]
            if (!relation) continue
            const foreignTable = relation.foreignTable
            const value = row[relName]
            if (relation.type === 'many') {
                const arr = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
                let result = arr
                if (relSpec.orderBy) result = sortBySpec(result, foreignTable, relSpec.orderBy)
                if (relSpec.limit !== undefined || relSpec.offset !== undefined) {
                    const start = relSpec.offset ?? 0
                    const end = relSpec.limit !== undefined ? start + relSpec.limit : undefined
                    result = result.slice(start, end)
                }
                if (relSpec.with) postProcess(result, foreignTable, relSpec.with)
                row[relName] = result
            } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                if (relSpec.with) postProcess([value as Record<string, unknown>], foreignTable, relSpec.with)
            }
        }
    }
    return rows
}

type IncludeParam<T extends AnyTable> = Parameters<SelectQueryBuilder<T>['include']>[0]

function applyOptions<T extends AnyTable>(
    orm: TauriORM,
    table: T,
    opts: RelationalQueryOptions<T>
): SelectQueryBuilder<T> {
    let builder = orm.select(table)
    if (opts.where && Object.keys(opts.where).length > 0) {
        builder = builder.where(compileFilter(opts.where, table, table._.name))
    }
    if (opts.orderBy) {
        for (const [col, dir] of Object.entries(opts.orderBy)) {
            const column = table._.columns[col]
            if (column && dir) builder = builder.orderBy(column, dir)
        }
    }
    if (opts.with && Object.keys(opts.with).length > 0) {
        builder = builder.include(toIncludeWith(table, opts.with) as IncludeParam<T>)
    }
    if (opts.limit !== undefined) builder = builder.limit(opts.limit)
    if (opts.offset !== undefined) {
        // SQLite requires LIMIT before OFFSET; LIMIT -1 means "no limit".
        if (opts.limit === undefined) builder = builder.limit(-1)
        builder = builder.offset(opts.offset)
    }
    return builder
}

/**
 * Build the experimental `db.query`-style API over an existing ORM instance.
 *
 * @example
 * ```ts
 * const { query, $count } = relationalQuery(orm, { users, posts })
 * const withPosts = await query.users.findMany({ with: { posts: true } })
 * const authors = await query.users.findMany({ where: { posts: { published: true } } })
 * const total = await $count(users, { age: { gt: 18 } })
 * ```
 */
export function relationalQuery<TTables extends Record<string, AnyTable>>(
    orm: TauriORM,
    tables: TTables
): RelationalQueryAPI<TTables> {
    const query: Record<string, RelationalTableQuery<AnyTable>> = {}
    for (const [key, table] of Object.entries(tables)) {
        query[key] = {
            findMany: async (opts: RelationalQueryOptions<AnyTable> = {}) => {
                const rows = await applyOptions(orm, table, opts).all()
                // Relations are present at runtime only; cast is documented in the header.
                return postProcess(rows as unknown as Record<string, unknown>[], table, opts.with) as unknown as InferSelectModel<AnyTable>[]
            },
            findFirst: async (opts: RelationalQueryOptions<AnyTable> = {}) => {
                const row = await applyOptions(orm, table, opts).get()
                if (!row) return undefined
                return postProcess([row as unknown as Record<string, unknown>], table, opts.with)[0] as unknown as InferSelectModel<AnyTable>
            },
        }
    }

    const $count: CountFn = async (table, filter) => {
        let builder = orm.select(table)
        if (filter && Object.keys(filter).length > 0) {
            builder = builder.where(compileFilter(filter, table, table._.name))
        }
        return builder.count()
    }

    return {
        // Dynamic key mapping from a known static type — safe unchecked cast.
        query: query as unknown as RelationalQuery<TTables>,
        $count,
    }
}
