import { SQLAggregate } from "./orm";
import { AnySQLiteColumn } from "./types";

// Aggregation functions that return SQLAggregate for use in SELECT clauses
export const count = (column?: AnySQLiteColumn): SQLAggregate<number> => ({
    sql: `COUNT(${column ? column._.name : "*"})`,
    params: [],
});

export const countDistinct = (column: AnySQLiteColumn): SQLAggregate<number> => ({
    sql: `COUNT(DISTINCT ${column._.name})`,
    params: [],
});

export const sum = (column: AnySQLiteColumn): SQLAggregate<number> => ({
    sql: `SUM(${column._.name})`,
    params: [],
});

export const avg = (column: AnySQLiteColumn): SQLAggregate<number> => ({
    sql: `AVG(${column._.name})`,
    params: [],
});

export const max = <T = any>(column: AnySQLiteColumn): SQLAggregate<T> => ({
    sql: `MAX(${column._.name})`,
    params: [],
});

export const min = <T = any>(column: AnySQLiteColumn): SQLAggregate<T> => ({
    sql: `MIN(${column._.name})`,
    params: [],
});

export const groupConcat = (
    column: AnySQLiteColumn,
    separator: string = ","
): SQLAggregate<string> => ({
    sql: `GROUP_CONCAT(${column._.name}, ?)`,
    params: [separator],
});

// Helper to use aggregates with an alias
export const as = <T>(aggregate: SQLAggregate<T>, alias: string): SQLAggregate<T> & { alias: string } => ({
    ...aggregate,
    alias,
});

