import {SQLCondition} from "./orm";
import {AnySQLiteColumn} from "./types";

export const eq = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
    sql: `${column._.name} = ?`,
    params: [value],
});
export const and = (...conditions: SQLCondition[]): SQLCondition => ({
    sql: conditions.map((c) => `(${c.sql})`).join(" AND "),
    params: conditions.flatMap((c) => c.params),
});
export const or = (...conditions: SQLCondition[]): SQLCondition => ({
    sql: conditions.map((c) => `(${c.sql})`).join(" OR "),
    params: conditions.flatMap((c) => c.params),
});
export const not = (condition: SQLCondition): SQLCondition => ({
    sql: `NOT (${condition.sql})`,
    params: condition.params,
});
export const gt = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
    sql: `${column._.name} > ?`,
    params: [value],
});
export const gte = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
    sql: `${column._.name} >= ?`,
    params: [value],
});
export const lt = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
    sql: `${column._.name} < ?`,
    params: [value],
});
export const lte = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
    sql: `${column._.name} <= ?`,
    params: [value],
});
export const like = (
    column: AnySQLiteColumn,
    pattern: string
): SQLCondition => ({
    sql: `${column._.name} LIKE ?`,
    params: [pattern],
});
export const isNull = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `${column._.name} IS NULL`,
    params: [],
});
export const isNotNull = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `${column._.name} IS NOT NULL`,
    params: [],
});
export const inArray = <T>(
    column: AnySQLiteColumn,
    values: T[]
): SQLCondition => ({
    sql: `${column._.name} IN (${values.map(() => "?").join(",")})`,
    params: values,
}); // Aggregation functions
export const count = (column?: AnySQLiteColumn): SQLCondition => ({
    sql: `COUNT(${column ? column._.name : "*"})`,
    params: [],
});
export const countDistinct = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `COUNT(DISTINCT ${column._.name})`,
    params: [],
});
export const sum = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `SUM(${column._.name})`,
    params: [],
});
export const avg = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `AVG(${column._.name})`,
    params: [],
});
export const max = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `MAX(${column._.name})`,
    params: [],
});
export const min = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `MIN(${column._.name})`,
    params: [],
});