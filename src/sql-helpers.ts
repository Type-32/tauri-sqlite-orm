import type { Column, Table } from "./schema-builder";

// A type to represent a piece of a SQL query
export interface SQL {
  toSQL: () => { clause: string; bindings: any[] };
}

// Helper to check if a value is a Column object
function isColumn(value: any): value is Column {
  return typeof value === "object" && value !== null && "_dataType" in value;
}

// Function to get the qualified name of a column (table.column)
function getQualifiedName(column: Column): string {
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

// Ordering helpers
export const asc = (column: Column) => `${column.name} ASC`;
export const desc = (column: Column) => `${column.name} DESC`;
