/**
 * Relations v2 API - Drizzle-style defineRelations with from/to and many-without-one.
 * Use defineRelations() for a single place to define all relations, or defineRelationsPart() to split into parts.
 */

import { AnySQLiteColumn, AnyTable } from './types'
import { OneRelation, ManyRelation } from './orm'
import type { Condition } from './operators'

/** Extract tables from a schema object (filters to Table instances with _ and relations) */
function extractTables(schema: Record<string, unknown>): Record<string, AnyTable> {
    const tables: Record<string, AnyTable> = {}
    for (const [key, value] of Object.entries(schema)) {
        const v = value as any
        if (v && typeof v === 'object' && v._?.name && v._?.columns && typeof v.relations === 'object') {
            tables[key] = v as AnyTable
        }
    }
    return tables
}

/** Options for one() relation - from/to replace fields/references */
export interface OneRelationOptions {
    from: AnySQLiteColumn | AnySQLiteColumn[]
    to: AnySQLiteColumn | AnySQLiteColumn[]
    optional?: boolean
    alias?: string
}

/** Reference for through() - column with junction column for many-to-many */
export interface ThroughRef {
    column: AnySQLiteColumn
    junctionColumn: AnySQLiteColumn
    junctionTable: AnyTable
}

/** Create a through reference for many-to-many: through(column, junctionColumn, junctionTable) */
export function through(
    column: AnySQLiteColumn,
    junctionColumn: AnySQLiteColumn,
    junctionTable: AnyTable
): ThroughRef {
    return { column, junctionColumn, junctionTable }
}

/** Options for many() relation - optional explicit from/to for many-without-one, or through() for many-to-many */
export interface ManyRelationOptions {
    from?: AnySQLiteColumn | AnySQLiteColumn[] | ThroughRef
    to?: AnySQLiteColumn | AnySQLiteColumn[] | ThroughRef
    optional?: boolean
    alias?: string
    /** Predefined filter: (alias) => Condition. Applied to the joined relation table. */
    where?: (alias: string) => Condition
}

/** Normalize column(s) to array */
function toArray(col: AnySQLiteColumn | AnySQLiteColumn[]): AnySQLiteColumn[] {
    return Array.isArray(col) ? col : [col]
}

/** Check if value is ThroughRef */
function isThroughRef(v: any): v is ThroughRef {
    return v && typeof v === 'object' && 'column' in v && 'junctionColumn' in v && 'junctionTable' in v
}

/** Build table column references for use in from/to - r.users.id etc. */
function buildTableRef(table: AnyTable): Record<string, AnySQLiteColumn> {
    return { ...table._.columns }
}

/** Extract table keys from schema (values that extend AnyTable) */
type ExtractTableKeys<T> = { [K in keyof T]: T[K] extends AnyTable ? K : never }[keyof T]
type ExtractTables<T extends Record<string, unknown>> = Pick<
    T,
    Extract<ExtractTableKeys<T>, keyof T>
> extends infer R
    ? R extends Record<string, AnyTable>
        ? R
        : Record<string, AnyTable>
    : Record<string, AnyTable>

/** Build the r object passed to defineRelations callback - all properties required to avoid TS2722 */
export type BuildR<Tables extends Record<string, AnyTable>> = {
    [K in keyof Tables]: Tables[K]['_']['columns']
} & {
    one: {
        [K in keyof Tables]: (opts: OneRelationOptions) => OneRelation<Tables[K]>
    }
    many: {
        [K in keyof Tables]: (opts?: ManyRelationOptions) => ManyRelation<Tables[K]>
    }
}

function buildR<Tables extends Record<string, AnyTable>>(
    tables: Tables
): BuildR<Tables> {
    const tableRefs = {} as Record<string, Record<string, AnySQLiteColumn>>
    const oneFns = {} as Record<string, (opts: OneRelationOptions) => OneRelation<AnyTable>>
    const manyFns = {} as Record<string, (opts?: ManyRelationOptions) => ManyRelation<AnyTable>>

    for (const [tableKey, table] of Object.entries(tables)) {
        tableRefs[tableKey] = buildTableRef(table)
        const foreignTable = table
        oneFns[tableKey] = (opts: OneRelationOptions) => {
            return new OneRelation(foreignTable, {
                fields: toArray(opts.from),
                references: toArray(opts.to),
                optional: opts.optional,
                alias: opts.alias,
            })
        }
        manyFns[tableKey] = (opts?: ManyRelationOptions) => {
            if (!opts?.from || !opts?.to) return new ManyRelation(foreignTable)
            if (isThroughRef(opts.from) && isThroughRef(opts.to)) {
                return new ManyRelation(foreignTable, {
                    through: {
                        junctionTable: opts.from.junctionTable,
                        fromRef: { column: opts.from.column, junctionColumn: opts.from.junctionColumn },
                        toRef: { column: opts.to.column, junctionColumn: opts.to.junctionColumn },
                    },
                    optional: opts.optional,
                    alias: opts.alias,
                    where: opts.where,
                })
            }
            return new ManyRelation(foreignTable, {
                from: toArray(opts.from as AnySQLiteColumn),
                to: toArray(opts.to as AnySQLiteColumn),
                optional: opts.optional,
                alias: opts.alias,
                where: opts.where,
            })
        }
    }

    return {
        ...tableRefs,
        one: oneFns as any,
        many: manyFns as any,
    } as any
}

/** Apply relations from defineRelations result to tables */
function applyRelationsToTables(
    tables: Record<string, AnyTable>,
    relationsResult: Record<string, Record<string, OneRelation | ManyRelation>>
): void {
    for (const [tableKey, rels] of Object.entries(relationsResult)) {
        const table = tables[tableKey]
        if (!table) continue

        for (const [relName, relation] of Object.entries(rels)) {
            if (relation instanceof OneRelation) {
                table.relations[relName] = {
                    type: 'one',
                    foreignTable: relation.foreignTable,
                    fields: relation.config?.fields,
                    references: relation.config?.references,
                    optional: relation.config?.optional,
                    alias: relation.config?.alias,
                }
            } else if (relation instanceof ManyRelation) {
                const config = relation.config
                if (config?.through) {
                    table.relations[relName] = {
                        type: 'many',
                        foreignTable: relation.foreignTable,
                        junctionTable: config.through.junctionTable,
                        fromJunction: config.through.fromRef,
                        toJunction: config.through.toRef,
                        optional: config.optional,
                        alias: config.alias,
                        where: config.where,
                    }
                } else {
                    table.relations[relName] = {
                        type: 'many',
                        foreignTable: relation.foreignTable,
                        fields: config ? config.to : undefined,
                        references: config ? config.from : undefined,
                        optional: config?.optional,
                        alias: config?.alias,
                        where: config?.where,
                    }
                }
            }
        }
    }
}

export type DefineRelationsCallback<Tables extends Record<string, AnyTable>> = (
    r: BuildR<Tables>
) => {
    [K in keyof Tables]?: Record<string, OneRelation | ManyRelation>
}

/**
 * Define all relations for your schema in one place (v2 API).
 * Uses from/to instead of fields/references, and supports many-without-one.
 *
 * @example
 * ```ts
 * import * as schema from './schema'
 * import { defineRelations } from '@type32/tauri-sqlite-orm'
 *
 * export const relations = defineRelations(schema, (r) => ({
 *   users: {
 *     posts: r.many.posts({ from: r.users.id, to: r.posts.userId }),
 *   },
 *   posts: {
 *     user: r.one.users({ from: r.posts.userId, to: r.users.id }),
 *     postTags: r.many.postTags({ from: r.posts.id, to: r.postTags.postId }),
 *   },
 * }))
 * ```
 */
export function defineRelations<TSchema extends Record<string, unknown>>(
    schema: TSchema,
    callback: DefineRelationsCallback<ExtractTables<TSchema>>
): Record<string, Record<string, OneRelation | ManyRelation>> {
    const tables = extractTables(schema) as ExtractTables<TSchema>
    const r = buildR(tables)
    const result = callback(r)
    applyRelationsToTables(tables, result as Record<string, Record<string, OneRelation | ManyRelation>>)
    return result as Record<string, Record<string, OneRelation | ManyRelation>>
}

/**
 * Define a part of relations - merge multiple parts when passing to TauriORM.
 * Useful for splitting large schema definitions.
 */
export function defineRelationsPart<TSchema extends Record<string, unknown>>(
    schema: TSchema,
    callback: DefineRelationsCallback<Record<string, AnyTable>>
): Record<string, Record<string, OneRelation | ManyRelation>> {
    return defineRelations(schema, callback)
}
