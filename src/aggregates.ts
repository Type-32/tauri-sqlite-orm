import { Expression, sql } from 'kysely'
import { AnySQLiteColumn } from './types'

export const count = (column?: AnySQLiteColumn): Expression<number> =>
    sql<number>`COUNT(${column ? sql.ref(column._.name) : sql.raw('*')})`

export const countDistinct = (column: AnySQLiteColumn): Expression<number> =>
    sql<number>`COUNT(DISTINCT ${sql.ref(column._.name)})`

export const sum = (column: AnySQLiteColumn): Expression<number> =>
    sql<number>`SUM(${sql.ref(column._.name)})`

export const avg = (column: AnySQLiteColumn): Expression<number> =>
    sql<number>`AVG(${sql.ref(column._.name)})`

export const max = <T = any>(column: AnySQLiteColumn): Expression<T> =>
    sql<T>`MAX(${sql.ref(column._.name)})`

export const min = <T = any>(column: AnySQLiteColumn): Expression<T> =>
    sql<T>`MIN(${sql.ref(column._.name)})`

export const groupConcat = (column: AnySQLiteColumn, separator: string = ','): Expression<string> =>
    sql<string>`GROUP_CONCAT(${sql.ref(column._.name)}, ${sql.val(separator)})`

export const as = <T>(aggregate: Expression<T>, alias: string): Expression<T> & { alias: string } =>
    Object.assign(aggregate, { alias })
