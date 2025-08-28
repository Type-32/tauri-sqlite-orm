// drizzle-orm-sqlite.ts
import Database from "@tauri-apps/plugin-sql";
import { AnySQLiteColumn, AnyTable, InferSelectModel, Table } from "./schema";
import {
  DeleteQueryBuilder,
  InsertQueryBuilder,
  SelectBuilder,
  SelectedFields,
  UpdateQueryBuilder,
  WithQueryBuilder,
} from "./query-builder";

// Main ORM Class
export class TauriORM {
  private tables: Map<string, AnyTable> = new Map();

  constructor(
    private db: Database,
    schema:
      | Record<string, AnyTable | Record<string, Relation>>
      | undefined = undefined
  ) {
    if (schema) {
      for (const table of Object.values(schema)) {
        if (table instanceof Table) {
          this.tables.set(table._.name, table);
        }
      }
    }
  }

  private buildColumnDefinition(
    col: AnySQLiteColumn,
    forAlterTable: boolean = false
  ): string {
    let sql = `${col._.name} ${col.type}`;
    if (col.options.primaryKey && !forAlterTable) {
      sql += " PRIMARY KEY";
      if (col._.autoincrement) {
        sql += " AUTOINCREMENT";
      }
    }
    if (col._.notNull) sql += " NOT NULL";
    if (col.options.unique) sql += " UNIQUE";
    if (col.options.default !== undefined) {
      const value = col.options.default;
      sql += ` DEFAULT ${
        typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : value
      }`;
    }
    if (col.options.references) {
      sql += ` REFERENCES ${col.options.references.table._.name}(${col.options.references.column._.name})`;
    }
    return sql;
  }

  async migrate(): Promise<void> {
    for (const table of this.tables.values()) {
      const existingTableInfo: { name: string }[] = await this.db.select(
        `PRAGMA table_info('${table._.name}')`
      );

      if (existingTableInfo.length === 0) {
        // Table does not exist, create it
        const columnsSql = Object.values(table._.columns)
          .map((col) => this.buildColumnDefinition(col))
          .join(", ");
        const createSql = `CREATE TABLE ${table._.name} (${columnsSql})`;
        await this.db.execute(createSql);
      } else {
        // Table exists, add missing columns
        const existingColumnNames = new Set(
          existingTableInfo.map((c) => c.name)
        );
        for (const column of Object.values(table._.columns)) {
          if (!existingColumnNames.has(column._.name)) {
            const columnSql = this.buildColumnDefinition(column, true);
            const alterSql = `ALTER TABLE ${table._.name} ADD COLUMN ${columnSql}`;
            await this.db.execute(alterSql);
          }
        }
      }
    }
  }

  select(): SelectBuilder<undefined>;
  select<TSelection extends SelectedFields>(
    selection: TSelection
  ): SelectBuilder<TSelection>;
  select<TSelection extends SelectedFields>(
    selection?: TSelection
  ): SelectBuilder<TSelection | undefined> {
    return new SelectBuilder(this.db, selection);
  }

  insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
    return new InsertQueryBuilder(this.db, table);
  }

  update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
    return new UpdateQueryBuilder(this.db, table);
  }

  delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
    return new DeleteQueryBuilder(this.db, table);
  }

  $with(alias: string): {
    as: (query: { sql: string; params: any[] }) => WithQueryBuilder;
  } {
    const withBuilder = new WithQueryBuilder(this.db);
    return {
      as: (query: { sql: string; params: any[] }) => {
        withBuilder.with(alias, query);
        return withBuilder;
      },
    };
  }

  async transaction<T>(callback: (tx: TauriORM) => Promise<T>): Promise<T> {
    await this.db.execute("BEGIN TRANSACTION");
    try {
      const result = await callback(this);
      await this.db.execute("COMMIT");
      return result;
    } catch (error) {
      await this.db.execute("ROLLBACK");
      throw error;
    }
  }

  rollback(): never {
    throw new Error("Transaction rolled back");
  }

  // --- Schema detection / signature ---
  private async ensureSchemaMeta(): Promise<void> {
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS _schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
    );
  }

  private async getSchemaMeta(key: string): Promise<string | null> {
    await this.ensureSchemaMeta();
    const rows = await this.db.select<any[]>(
      `SELECT value FROM _schema_meta WHERE key = ?`,
      [key]
    );
    return rows?.[0]?.value ?? null;
  }

  private async setSchemaMeta(key: string, value: string): Promise<void> {
    await this.ensureSchemaMeta();
    await this.db.execute(
      `INSERT INTO _schema_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  private normalizeColumn(col: AnySQLiteColumn): any {
    return {
      name: col._.name,
      type: col.type,
      pk: !!col.options.primaryKey,
      ai: !!col._.autoincrement,
      nn: !!col._.notNull,
      unique: !!col.options.unique,
      dv:
        col.options.default &&
        typeof col.options.default === "object" &&
        (col.options.default as any).raw
          ? { raw: (col.options.default as any).raw }
          : col.options.default ?? null,
      hasDefaultFn: col.options.$defaultFn !== undefined,
      hasOnUpdateFn: col.options.$onUpdateFn !== undefined,
    };
  }

  private computeModelSignature(): string {
    const entries = Array.from(this.tables.values()).map((tbl) => {
      const cols = Object.values(tbl._.columns)
        .map((c) => this.normalizeColumn(c))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { table: tbl._.name, columns: cols };
    });
    entries.sort((a, b) => a.table.localeCompare(b.table));
    return JSON.stringify(entries);
  }

  getSchemaSignature(): string {
    return this.computeModelSignature();
  }

  async isSchemaDirty(): Promise<{
    dirty: boolean;
    current: string;
    stored: string | null;
  }> {
    const sig = this.computeModelSignature();
    const stored = await this.getSchemaMeta("schema_signature");
    return { dirty: sig !== stored, current: sig, stored };
  }

  async migrateIfDirty(): Promise<boolean> {
    const status = await this.isSchemaDirty();
    if (status.dirty) {
      await this.migrate();
      await this.setSchemaMeta(
        "schema_signature",
        this.computeModelSignature()
      );
      return true;
    }
    return false;
  }
}

// Relations
export class Relation<T extends AnyTable = AnyTable> {
  constructor(public foreignTable: T) {}
}
export class OneRelation<T extends AnyTable = AnyTable> extends Relation<T> {
  constructor(
    foreignTable: T,
    public config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
  ) {
    super(foreignTable);
  }
}
export class ManyRelation<T extends AnyTable = AnyTable> extends Relation<T> {
  constructor(foreignTable: T) {
    super(foreignTable);
  }
}

type RelationsBuilder = {
  one: <U extends AnyTable>(
    table: U,
    config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
  ) => OneRelation<U>;
  many: <U extends AnyTable>(table: U) => ManyRelation<U>;
};

export const relations = <
  T extends AnyTable,
  R extends Record<string, Relation>
>(
  _table: T,
  relationsCallback: (helpers: RelationsBuilder) => R
): R => {
  return relationsCallback({
    one: <U extends AnyTable>(
      table: U,
      config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
    ) => {
      return new OneRelation(table, config);
    },
    many: <U extends AnyTable>(table: U) => {
      return new ManyRelation(table);
    },
  });
};
