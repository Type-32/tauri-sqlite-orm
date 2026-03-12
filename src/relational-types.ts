import type { AnyTable, InferSelectModel } from './types'
import type { OneRelation, ManyRelation } from './orm'

/** Maps relations() return type to typed relation configs with foreign table preserved */
export type InferRelationsMap<R extends Record<string, OneRelation | ManyRelation>> = {
    [K in keyof R]: R[K] extends OneRelation<infer T>
        ? { type: 'one'; foreignTable: T }
        : R[K] extends ManyRelation<infer T>
        ? { type: 'many'; foreignTable: T }
        : never
}

/** With/include object shape - matches NestedInclude from select builder */
type WithShape = boolean | {
    columns?: string[] | Record<string, boolean>
    with?: Record<string, WithShape>
}

/** Map of table name -> relations() return type, for nested with support */
type RelationsByTable = Record<string, Record<string, OneRelation | ManyRelation>>

/** Get relations for a table from the all-relations map */
type GetRelationsForTable<
    TTable extends AnyTable,
    TAllRelations extends RelationsByTable
> = TAllRelations[TTable['_']['name']] extends Record<string, OneRelation | ManyRelation>
    ? InferRelationsMap<TAllRelations[TTable['_']['name']]>
    : Record<string, never>

/** Infer nested relation fields when TWith has a nested `with` */
type InferNestedFields<
    TForeignTable extends AnyTable,
    TWith extends WithShape,
    TAllRelations extends RelationsByTable
> = TWith extends { with?: infer TW }
    ? TW extends Record<string, WithShape>
        ? InferRelationFields<TForeignTable, GetRelationsForTable<TForeignTable, TAllRelations>, TAllRelations, TW>
        : unknown
    : unknown

/** Recursively build relation fields from a with object */
type InferRelationFields<
    TTable extends AnyTable,
    TRelationsMap extends Record<string, { type: 'one' | 'many'; foreignTable: AnyTable }>,
    TAllRelations extends RelationsByTable,
    TWith extends Record<string, WithShape>
> = {
    [K in keyof TWith & keyof TRelationsMap]: TWith[K] extends false | undefined
        ? never
        : TRelationsMap[K] extends { type: 'one'; foreignTable: infer T }
        ? T extends AnyTable
            ? InferSelectModel<T> & InferNestedFields<T, TWith[K], TAllRelations>
            : never
        : TRelationsMap[K] extends { type: 'many'; foreignTable: infer T }
        ? T extends AnyTable
            ? (InferSelectModel<T> & InferNestedFields<T, TWith[K], TAllRelations>)[]
            : never
        : never
}

/**
 * Infer the result type of a select query that includes relations via `.include(with)`.
 *
 * Use this to type variables that hold results from relational queries, e.g.:
 *
 * @example
 * ```ts
 * export type User = InferSelectModel<typeof schema.user>
 *
 * const withRelationalObject = { sessions: true, accounts: true } as const
 * export type UserWithRelations = InferRelationalSelectModel<
 *   typeof schema.user,
 *   typeof schema.userRelations,
 *   typeof withRelationalObject
 * >
 * ```
 *
 * For nested includes, pass a map of table name -> relations as the fourth parameter:
 *
 * @example
 * ```ts
 * const withNested = { sessions: { with: { user: true } } } as const
 * type UserWithSessionsAndUser = InferRelationalSelectModel<
 *   typeof schema.user,
 *   typeof schema.userRelations,
 *   typeof withNested,
 *   { user: typeof userRelations; session: typeof sessionRelations }
 * >
 * ```
 *
 * @param TTable - The table type (e.g. typeof schema.user)
 * @param TRelations - The relations for this table (e.g. typeof schema.userRelations)
 * @param TWith - The with/include object shape (use `as const` for literal inference)
 * @param TAllRelations - Optional map of table name -> relations for nested `with` support
 */
export type InferRelationalSelectModel<
    TTable extends AnyTable,
    TRelations extends Record<string, OneRelation | ManyRelation>,
    TWith extends Record<string, WithShape>,
    TAllRelations extends RelationsByTable = { [K in TTable['_']['name']]: TRelations }
> = InferSelectModel<TTable> &
    InferRelationFields<TTable, InferRelationsMap<TRelations>, TAllRelations, TWith>
