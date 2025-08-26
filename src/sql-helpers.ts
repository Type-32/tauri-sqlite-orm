import type { Column, Table } from "./schema-builder";

// A type to represent a piece of a SQL query
export interface SQL {
  toSQL: () => { clause: string; bindings: any[] };
}

// Generic raw SQL template tag
export function raw(strings: TemplateStringsArray, ...values: any[]): SQL {
  return {
    toSQL: () => {
      let clause = "";
      const bindings: any[] = [];
      for (let i = 0; i < strings.length; i++) {
        clause += strings[i];
        if (i < values.length) {
          const v = values[i];
          if (v && typeof v === "object" && typeof v.toSQL === "function") {
            const s = v.toSQL();
            clause += s.clause;
            bindings.push(...s.bindings);
          } else if (v && typeof v === "object" && "_dataType" in v) {
            clause += getQualifiedName(v as Column);
          } else {
            clause += "?";
            bindings.push(v);
          }
        }
      }
      return { clause, bindings };
    },
  };
}

// Helper to check if a value is a Column object
function isColumn(value: any): value is Column {
  return typeof value === "object" && value !== null && "_dataType" in value;
}

// Function to get the qualified name of a column (table.column)
export function getQualifiedName(column: Column): string {
  // Prefer table-qualified names when tableName is available
  if (column.tableName) return `${column.tableName}.${column.name}`;
  return column.name;
}

// Comparison Operator Helper
function comparison(operator: string, column: Column, value: any): SQL {
  return {
    toSQL: () => {
      if (isColumn(value)) {
        // Comparing two columns, e.g., eq(users.id, posts.authorId)
        return {
          clause: `${getQualifiedName(column)} ${operator} ${getQualifiedName(
            value
          )}`,
          bindings: [],
        };
      }
      // Comparing a column to a value
      return {
        clause: `${getQualifiedName(column)} ${operator} ?`,
        bindings: [value],
      };
    },
  };
}

// Logical combinators
export const and = (...conditions: SQL[]): SQL => ({
  toSQL: () => {
    const parts: string[] = [];
    const bindings: any[] = [];
    for (const c of conditions) {
      const s = c.toSQL();
      parts.push(`(${s.clause})`);
      bindings.push(...s.bindings);
    }
    return { clause: parts.join(" AND "), bindings };
  },
});

export const or = (...conditions: SQL[]): SQL => ({
  toSQL: () => {
    const parts: string[] = [];
    const bindings: any[] = [];
    for (const c of conditions) {
      const s = c.toSQL();
      parts.push(`(${s.clause})`);
      bindings.push(...s.bindings);
    }
    return { clause: parts.join(" OR "), bindings };
  },
});

export const not = (condition: SQL): SQL => ({
  toSQL: () => {
    const s = condition.toSQL();
    return { clause: `NOT (${s.clause})`, bindings: s.bindings };
  },
});

// --- Public Helper Functions ---

export const eq = (column: Column, value: any): SQL =>
  comparison("=", column, value);
export const ne = (column: Column, value: any): SQL =>
  comparison("!=", column, value);
export const gt = (column: Column, value: number | Date): SQL =>
  comparison(">", column, value);
export const gte = (column: Column, value: number | Date): SQL =>
  comparison(">=", column, value);
export const lt = (column: Column, value: number | Date): SQL =>
  comparison("<", column, value);
export const lte = (column: Column, value: number | Date): SQL =>
  comparison("<=", column, value);
export const like = (column: Column<string>, value: string): SQL =>
  comparison("LIKE", column, value);

// Case-insensitive like (SQLite fallback via lower())
export const ilike = (column: Column<string>, value: string | Column): SQL => ({
  toSQL: () => {
    const colExpr = `LOWER(${getQualifiedName(column)})`;
    if (isColumn(value)) {
      return {
        clause: `${colExpr} LIKE LOWER(${getQualifiedName(value)})`,
        bindings: [],
      };
    }
    return { clause: `${colExpr} LIKE LOWER(?)`, bindings: [value] };
  },
});
export const notIlike = (
  column: Column<string>,
  value: string | Column
): SQL => ({
  toSQL: () => {
    const colExpr = `LOWER(${getQualifiedName(column)})`;
    if (isColumn(value)) {
      return {
        clause: `${colExpr} NOT LIKE LOWER(${getQualifiedName(value)})`,
        bindings: [],
      };
    }
    return { clause: `${colExpr} NOT LIKE LOWER(?)`, bindings: [value] };
  },
});

export const isNull = (column: Column): SQL => ({
  toSQL: () => ({
    clause: `${getQualifiedName(column)} IS NULL`,
    bindings: [],
  }),
});
export const isNotNull = (column: Column): SQL => ({
  toSQL: () => ({
    clause: `${getQualifiedName(column)} IS NOT NULL`,
    bindings: [],
  }),
});

export const between = (
  column: Column,
  from: number | string | Date | Column,
  to: number | string | Date | Column
): SQL => ({
  toSQL: () => {
    const left = getQualifiedName(column);
    const [fromClause, fromBindings] = isColumn(from)
      ? [getQualifiedName(from), []]
      : ["?", [from]];
    const [toClause, toBindings] = isColumn(to)
      ? [getQualifiedName(to), []]
      : ["?", [to]];
    return {
      clause: `${left} BETWEEN ${fromClause} AND ${toClause}`,
      bindings: [...fromBindings, ...toBindings],
    };
  },
});

export const notBetween = (
  column: Column,
  from: number | string | Date | Column,
  to: number | string | Date | Column
): SQL => ({
  toSQL: () => {
    const left = getQualifiedName(column);
    const [fromClause, fromBindings] = isColumn(from)
      ? [getQualifiedName(from), []]
      : ["?", [from]];
    const [toClause, toBindings] = isColumn(to)
      ? [getQualifiedName(to), []]
      : ["?", [to]];
    return {
      clause: `${left} NOT BETWEEN ${fromClause} AND ${toClause}`,
      bindings: [...fromBindings, ...toBindings],
    };
  },
});

export const inArray = (
  column: Column,
  valuesOrQuery:
    | any[]
    | SQL
    | { toSQL: () => { clause: string; bindings: any[] } }
): SQL => ({
  toSQL: () => {
    const left = getQualifiedName(column);
    if (Array.isArray(valuesOrQuery)) {
      const placeholders = valuesOrQuery.map(() => "?").join(", ");
      return {
        clause: `${left} IN (${placeholders})`,
        bindings: valuesOrQuery,
      };
    }
    const sq = (valuesOrQuery as any).toSQL
      ? (valuesOrQuery as any).toSQL()
      : (valuesOrQuery as SQL).toSQL();
    return { clause: `${left} IN (${sq.clause})`, bindings: sq.bindings };
  },
});

export const notInArray = (
  column: Column,
  valuesOrQuery:
    | any[]
    | SQL
    | { toSQL: () => { clause: string; bindings: any[] } }
): SQL => ({
  toSQL: () => {
    const left = getQualifiedName(column);
    if (Array.isArray(valuesOrQuery)) {
      const placeholders = valuesOrQuery.map(() => "?").join(", ");
      return {
        clause: `${left} NOT IN (${placeholders})`,
        bindings: valuesOrQuery,
      };
    }
    const sq = (valuesOrQuery as any).toSQL
      ? (valuesOrQuery as any).toSQL()
      : (valuesOrQuery as SQL).toSQL();
    return { clause: `${left} NOT IN (${sq.clause})`, bindings: sq.bindings };
  },
});

export const exists = (
  subquery: SQL | { toSQL: () => { clause: string; bindings: any[] } }
): SQL => ({
  toSQL: () => {
    const sq = (subquery as any).toSQL
      ? (subquery as any).toSQL()
      : (subquery as SQL).toSQL();
    return { clause: `EXISTS (${sq.clause})`, bindings: sq.bindings };
  },
});

export const notExists = (
  subquery: SQL | { toSQL: () => { clause: string; bindings: any[] } }
): SQL => ({
  toSQL: () => {
    const sq = (subquery as any).toSQL
      ? (subquery as any).toSQL()
      : (subquery as SQL).toSQL();
    return { clause: `NOT EXISTS (${sq.clause})`, bindings: sq.bindings };
  },
});

// Ordering helpers
export const asc = (column: Column) => `${getQualifiedName(column)} ASC`;
export const desc = (column: Column) => `${getQualifiedName(column)} DESC`;
