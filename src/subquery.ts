import { SQLSubquery } from "./orm";
import { SelectQueryBuilder } from "./builders/select";
import { AnyTable } from "./types";

// Convert a SelectQueryBuilder to a subquery
export const subquery = <T extends AnyTable>(
    query: SelectQueryBuilder<T, any>
): SQLSubquery => {
    const { sql, params } = query.toSQL();
    return {
        sql: `(${sql})`,
        params,
        _isSubquery: true,
    };
};

// Helper for scalar subqueries (returns single value)
export const scalarSubquery = <T extends AnyTable>(
    query: SelectQueryBuilder<T, any>
): SQLSubquery => {
    return subquery(query);
};

