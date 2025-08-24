import type { Table, Column } from "./schema-builder";

function generateCreateTableSql(table: Table<any>): string {
  const tableName = table._tableName;
  const columns: Column<any>[] = Object.values(table._schema);

  const columnDefs = columns.map((col) => {
    let def = `${col.name} ${col.type}`;
    if (col.isPrimaryKey) def += " PRIMARY KEY AUTOINCREMENT";
    if (col.isNotNull) def += " NOT NULL";
    if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
    return def;
  });

  return `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(", ")});`;
}

// Deprecated: keep for reference only. Prefer using ORM.migrate.
// export async function runMigrations(tables: Table<any>[]) { /* removed */ }
