import {SQLCondition, SQLSubquery} from "./orm";
import {AnySQLiteColumn} from "./types";

export const eq = <T>(column: AnySQLiteColumn, value: T, tableAlias?: string): SQLCondition => {
    const columnName = tableAlias ? `${tableAlias}.${column._.name}` : column._.name;
    return {
        sql: `${columnName} = ?`,
        params: [value],
    };
};
export const ne = <T>(column: AnySQLiteColumn, value: T, tableAlias?: string): SQLCondition => {
    const columnName = tableAlias ? `${tableAlias}.${column._.name}` : column._.name;
    return {
        sql: `${columnName} != ?`,
        params: [value],
    };
};
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
export const ilike = (
    column: AnySQLiteColumn,
    pattern: string
): SQLCondition => ({
    sql: `${column._.name} LIKE ? COLLATE NOCASE`,
    params: [pattern],
});
export const startsWith = (
    column: AnySQLiteColumn,
    value: string
): SQLCondition => ({
    sql: `${column._.name} LIKE ?`,
    params: [`${value}%`],
});
export const endsWith = (
    column: AnySQLiteColumn,
    value: string
): SQLCondition => ({
    sql: `${column._.name} LIKE ?`,
    params: [`%${value}`],
});
export const contains = (
    column: AnySQLiteColumn,
    value: string
): SQLCondition => ({
    sql: `${column._.name} LIKE ?`,
    params: [`%${value}%`],
});
export const isNull = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `${column._.name} IS NULL`,
    params: [],
});
export const isNotNull = (column: AnySQLiteColumn): SQLCondition => ({
    sql: `${column._.name} IS NOT NULL`,
    params: [],
});
export const exists = (subquery: { sql: string; params: any[] }): SQLCondition => ({
    sql: `EXISTS (${subquery.sql})`,
    params: subquery.params,
});
export const notExists = (subquery: { sql: string; params: any[] }): SQLCondition => ({
    sql: `NOT EXISTS (${subquery.sql})`,
    params: subquery.params,
});

// Comparison operators that work with subqueries or values
export const eqSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} = ${subquery.sql}`,
    params: subquery.params,
});

export const neSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} != ${subquery.sql}`,
    params: subquery.params,
});

export const gtSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} > ${subquery.sql}`,
    params: subquery.params,
});

export const gteSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} >= ${subquery.sql}`,
    params: subquery.params,
});

export const ltSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} < ${subquery.sql}`,
    params: subquery.params,
});

export const lteSubquery = (column: AnySQLiteColumn, subquery: SQLSubquery): SQLCondition => ({
    sql: `${column._.name} <= ${subquery.sql}`,
    params: subquery.params,
});
export const inArray = <T>(
    column: AnySQLiteColumn,
    values: T[] | SQLSubquery
): SQLCondition => {
    if ('_isSubquery' in values && values._isSubquery) {
        return {
            sql: `${column._.name} IN ${values.sql}`,
            params: values.params,
        };
    }
    return {
        sql: `${column._.name} IN (${(values as T[]).map(() => "?").join(",")})`,
        params: values as T[],
    };
};
export const notIn = <T>(
    column: AnySQLiteColumn,
    values: T[] | SQLSubquery
): SQLCondition => {
    if ('_isSubquery' in values && values._isSubquery) {
        return {
            sql: `${column._.name} NOT IN ${values.sql}`,
            params: values.params,
        };
    }
    return {
        sql: `${column._.name} NOT IN (${(values as T[]).map(() => "?").join(",")})`,
        params: values as T[],
    };
};
export const between = <T>(
    column: AnySQLiteColumn,
    min: T,
    max: T
): SQLCondition => ({
    sql: `${column._.name} BETWEEN ? AND ?`,
    params: [min, max],
});