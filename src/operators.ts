import { Expression, isExpression, sql, SqlBool } from 'kysely'
import { AnySQLiteColumn } from './types'
import { serializeValue } from './serialization'

export type Condition = Expression<SqlBool>

export const eq = <T>(column: AnySQLiteColumn, value: T, tableAlias?: string): Condition => {
    const colRef = tableAlias ? `${tableAlias}.${column._.name}` : column._.name
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(colRef)} = ${sql.val(serialized)}`
}

export const ne = <T>(column: AnySQLiteColumn, value: T, tableAlias?: string): Condition => {
    const colRef = tableAlias ? `${tableAlias}.${column._.name}` : column._.name
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(colRef)} != ${sql.val(serialized)}`
}

export const and = (...conditions: Condition[]): Condition => {
    if (conditions.length === 0) return sql<SqlBool>`1 = 1`
    if (conditions.length === 1) return conditions[0]
    return sql<SqlBool>`(${sql.join(conditions.map(c => sql`(${c})`), sql` AND `)})`
}

export const or = (...conditions: Condition[]): Condition => {
    if (conditions.length === 0) return sql<SqlBool>`1 = 1`
    if (conditions.length === 1) return conditions[0]
    return sql<SqlBool>`(${sql.join(conditions.map(c => sql`(${c})`), sql` OR `)})`
}

export const not = (condition: Condition): Condition =>
    sql<SqlBool>`NOT (${condition})`

export const gt = <T>(column: AnySQLiteColumn, value: T): Condition => {
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(column._.name)} > ${sql.val(serialized)}`
}

export const gte = <T>(column: AnySQLiteColumn, value: T): Condition => {
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(column._.name)} >= ${sql.val(serialized)}`
}

export const lt = <T>(column: AnySQLiteColumn, value: T): Condition => {
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(column._.name)} < ${sql.val(serialized)}`
}

export const lte = <T>(column: AnySQLiteColumn, value: T): Condition => {
    const serialized = serializeValue(value, column)
    return sql<SqlBool>`${sql.ref(column._.name)} <= ${sql.val(serialized)}`
}

export const like = (column: AnySQLiteColumn, pattern: string): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} LIKE ${sql.val(pattern)}`

export const ilike = (column: AnySQLiteColumn, pattern: string): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} LIKE ${sql.val(pattern)} COLLATE NOCASE`

export const startsWith = (column: AnySQLiteColumn, value: string): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} LIKE ${sql.val(`${value}%`)}`

export const endsWith = (column: AnySQLiteColumn, value: string): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} LIKE ${sql.val(`%${value}`)}`

export const contains = (column: AnySQLiteColumn, value: string): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} LIKE ${sql.val(`%${value}%`)}`

export const isNull = (column: AnySQLiteColumn): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} IS NULL`

export const isNotNull = (column: AnySQLiteColumn): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} IS NOT NULL`

// SQLite rejects EXISTS ((subquery)); use single paren level
export const exists = (subquery: Expression<any>): Condition =>
    sql<SqlBool>`EXISTS ${subquery}`

export const notExists = (subquery: Expression<any>): Condition =>
    sql<SqlBool>`NOT EXISTS ${subquery}`

export const eqSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} = (${subquery})`

export const neSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} != (${subquery})`

export const gtSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} > (${subquery})`

export const gteSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} >= (${subquery})`

export const ltSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} < (${subquery})`

export const lteSubquery = (column: AnySQLiteColumn, subquery: Expression<any>): Condition =>
    sql<SqlBool>`${sql.ref(column._.name)} <= (${subquery})`

export const inArray = <T>(column: AnySQLiteColumn, values: T[] | Expression<any>): Condition => {
    if (isExpression(values)) {
        return sql<SqlBool>`${sql.ref(column._.name)} IN (${values as Expression<any>})`
    }
    const arr = values as T[]
    if (arr.length === 0) return sql<SqlBool>`1 = 0`
    const serialized = arr.map(v => sql.val(serializeValue(v, column)))
    return sql<SqlBool>`${sql.ref(column._.name)} IN (${sql.join(serialized)})`
}

export const notIn = <T>(column: AnySQLiteColumn, values: T[] | Expression<any>): Condition => {
    if (isExpression(values)) {
        return sql<SqlBool>`${sql.ref(column._.name)} NOT IN (${values as Expression<any>})`
    }
    const arr = values as T[]
    if (arr.length === 0) return sql<SqlBool>`1 = 1`
    const serialized = arr.map(v => sql.val(serializeValue(v, column)))
    return sql<SqlBool>`${sql.ref(column._.name)} NOT IN (${sql.join(serialized)})`
}

export const between = <T>(column: AnySQLiteColumn, min: T, max: T): Condition => {
    const serializedMin = serializeValue(min, column)
    const serializedMax = serializeValue(max, column)
    return sql<SqlBool>`${sql.ref(column._.name)} BETWEEN ${sql.val(serializedMin)} AND ${sql.val(serializedMax)}`
}
