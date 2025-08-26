// drizzle-orm-sqlite.ts
import Database from "@tauri-apps/plugin-sql";

// Core Types
export type ColumnDataType = "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
export type Mode = "default" | "timestamp" | "timestamp_ms" | "json";

// Column Value Types Mapping
type ColumnValueTypes<
  TType extends ColumnDataType,
  TMode extends Mode
> = TType extends "TEXT"
  ? string
  : TType extends "INTEGER"
  ? TMode extends "timestamp" | "timestamp_ms"
    ? Date
    : number
  : TType extends "REAL"
  ? number
  : TType extends "BOOLEAN"
  ? boolean
  : TType extends "BLOB"
  ? Uint8Array
  : never;

// Column Options
export interface ColumnOptions<TData> {
  notNull?: boolean;
  default?: TData;
  $defaultFn?: () => TData;
  primaryKey?: boolean;
  autoincrement?: boolean;
  unique?: boolean;
  references?: {
    table: AnyTable;
    column: AnySQLiteColumn;
  };
  mode?: Mode;
  $onUpdateFn?: () => TData;
}

// Extract column value type
type ExtractColumnType<T extends AnySQLiteColumn> = T extends SQLiteColumn<
  infer _,
  infer TType,
  infer TMode,
  infer TNotNull,
  infer THasDefault
>
  ? THasDefault extends true
    ? TNotNull extends true
      ? ColumnValueTypes<TType, TMode>
      : ColumnValueTypes<TType, TMode> | null | undefined
    : TNotNull extends true
    ? ColumnValueTypes<TType, TMode>
    : ColumnValueTypes<TType, TMode> | null | undefined
  : never;

// Column class
export class SQLiteColumn<
  TName extends string = string,
  TType extends ColumnDataType = ColumnDataType,
  TMode extends Mode = "default",
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
  TAutoincrement extends boolean = false
> {
  _: {
    name: TName;
    dataType: TType;
    mode: TMode;
    notNull: TNotNull;
    hasDefault: THasDefault;
    autoincrement: TAutoincrement;
  };

  constructor(
    name: TName,
    public type: TType,
    public options: ColumnOptions<ColumnValueTypes<TType, TMode>> = {},
    mode?: TMode
  ) {
    this._ = {
      name,
      dataType: type,
      mode: (mode || "default") as TMode,
      notNull: (options.notNull ?? false) as TNotNull,
      hasDefault: (options.default !== undefined ||
        options.$defaultFn !== undefined) as THasDefault,
      autoincrement: (options.autoincrement ?? false) as TAutoincrement,
    };
  }

  notNull(): SQLiteColumn<
    TName,
    TType,
    TMode,
    true,
    THasDefault,
    TAutoincrement
  > {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, notNull: true },
      this._.mode
    );
  }

  default(
    value: ColumnValueTypes<TType, TMode>
  ): SQLiteColumn<TName, TType, TMode, TNotNull, true, TAutoincrement> {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, default: value },
      this._.mode
    );
  }

  $defaultFn(
    fn: () => ColumnValueTypes<TType, TMode>
  ): SQLiteColumn<TName, TType, TMode, TNotNull, true, TAutoincrement> {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, $defaultFn: fn },
      this._.mode
    );
  }

  primaryKey(): SQLiteColumn<
    TName,
    TType,
    TMode,
    TNotNull,
    THasDefault,
    TAutoincrement
  > {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, primaryKey: true },
      this._.mode
    );
  }

  autoincrement(): SQLiteColumn<
    TName,
    TType,
    TMode,
    TNotNull,
    THasDefault,
    true
  > {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, autoincrement: true },
      this._.mode
    );
  }

  unique(): SQLiteColumn<
    TName,
    TType,
    TMode,
    TNotNull,
    THasDefault,
    TAutoincrement
  > {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, unique: true },
      this._.mode
    );
  }

  references<T extends AnyTable, K extends keyof T["_"]["columns"] & string>(
    ref: T,
    column: K
  ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement> {
    return new SQLiteColumn(
      this._.name,
      this.type,
      {
        ...this.options,
        references: {
          table: ref,
          column: ref._.columns[column],
        },
      },
      this._.mode
    );
  }

  $onUpdateFn(
    fn: () => ColumnValueTypes<TType, TMode>
  ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement> {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, $onUpdateFn: fn },
      this._.mode
    );
  }
}

// Column helpers
export const text = <TName extends string>(name: TName) =>
  new SQLiteColumn(name, "TEXT");

export const integer = <TName extends string, TMode extends Mode = "default">(
  name: TName,
  config?: { mode?: TMode }
) => new SQLiteColumn(name, "INTEGER", {}, config?.mode || "default");

export const real = <TName extends string>(name: TName) =>
  new SQLiteColumn(name, "REAL");

export const blob = <TName extends string>(name: TName) =>
  new SQLiteColumn(name, "BLOB");

export const boolean = <TName extends string>(name: TName) =>
  new SQLiteColumn(name, "BOOLEAN");

// Table Types
export type AnySQLiteColumn = SQLiteColumn<any, any, any, any, any, any>;
export type AnyTable = Table<Record<string, AnySQLiteColumn>, string>;

// Infer Model Types
export type InferSelectModel<T extends AnyTable> = {
  [K in keyof T["_"]["columns"]]: ExtractColumnType<T["_"]["columns"][K]>;
};

type RequiredColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
  [K in keyof TColumns]: TColumns[K]["_"]["notNull"] extends true
    ? TColumns[K]["_"]["hasDefault"] extends true
      ? never
      : K
    : never;
}[keyof TColumns];

type OptionalColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
  [K in keyof TColumns]: TColumns[K]["_"]["notNull"] extends true
    ? TColumns[K]["_"]["hasDefault"] extends true
      ? K
      : never
    : K;
}[keyof TColumns];

export type InferInsertModel<T extends AnyTable> = {
  [K in RequiredColumns<T["_"]["columns"]>]: ExtractColumnType<
    T["_"]["columns"][K]
  >;
} & {
  [K in OptionalColumns<T["_"]["columns"]>]?: ExtractColumnType<
    T["_"]["columns"][K]
  >;
};

// Table Definition
export class Table<
  TColumns extends Record<string, AnySQLiteColumn>,
  TTableName extends string
> {
  _: {
    name: TTableName;
    columns: TColumns;
  };

  constructor(name: TTableName, columns: TColumns) {
    this._ = {
      name,
      columns,
    };
  }
}

export const sqliteTable = <
  TTableName extends string,
  TColumns extends Record<string, AnySQLiteColumn>
>(
  tableName: TTableName,
  columns: TColumns
): Table<TColumns, TTableName> => {
  return new Table(tableName, columns);
};

// Query Helpers
export type SQLCondition = {
  sql: string;
  params: any[];
};

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
});

// Query Builders
class BaseQueryBuilder {
  protected query: string = "";
  protected params: any[] = [];

  constructor(protected db: Database) {}

  where(condition: SQLCondition): this {
    this.query += ` WHERE ${condition.sql}`;
    this.params.push(...condition.params);
    return this;
  }

  orderBy(column: AnySQLiteColumn, direction: "ASC" | "DESC" = "ASC"): this {
    this.query += ` ORDER BY ${column._.name} ${direction}`;
    return this;
  }

  limit(count: number): this {
    this.query += ` LIMIT ${count}`;
    return this;
  }

  offset(count: number): this {
    this.query += ` OFFSET ${count}`;
    return this;
  }

  build(): { sql: string; params: any[] } {
    return {
      sql: this.query,
      params: this.params,
    };
  }
}

export class SelectQueryBuilder<
  TTable extends AnyTable,
  TSelectedColumns extends
    | (keyof TTable["_"]["columns"])[]
    | undefined = undefined
> extends BaseQueryBuilder {
  constructor(
    db: Database,
    private table: TTable,
    private columns?: TSelectedColumns
  ) {
    super(db);
    const columnNames = columns
      ? columns.map((c) => table._.columns[c as string]._.name)
      : ["*"];

    this.query = `SELECT ${columnNames.join(", ")} FROM ${table._.name}`;
  }

  async execute(): Promise<
    TSelectedColumns extends (keyof TTable["_"]["columns"])[]
      ? Pick<InferSelectModel<TTable>, TSelectedColumns[number]>[]
      : InferSelectModel<TTable>[]
  > {
    const { sql, params } = this.build();
    return this.db.select(sql, ...params) as any;
  }
}

export class InsertQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private dataSets: Partial<InferInsertModel<T>>[] = [];

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `INSERT INTO ${table._.name}`;
  }

  values(
    data: Partial<InferInsertModel<T>> | Partial<InferInsertModel<T>>[]
  ): this {
    const dataArray = Array.isArray(data) ? data : [data];
    this.dataSets.push(...dataArray);
    return this;
  }

  async execute(): Promise<number> {
    if (this.dataSets.length === 0) {
      throw new Error("No data provided for insert");
    }

    const columns = Object.keys(
      this.dataSets[0]
    ) as (keyof T["_"]["columns"])[];
    const columnNames = columns.map(
      (c) => this.table._.columns[c as string]._.name
    );
    const placeholders = `(${columnNames.map(() => "?").join(", ")})`;
    const valuesSql = this.dataSets.map(() => placeholders).join(", ");

    this.query += ` (${columnNames.join(", ")}) VALUES ${valuesSql}`;

    const params = this.dataSets.flatMap((data) =>
      columns.map((col) => (data as any)[col])
    );

    const result = await this.db.execute(this.query, ...params);
    return result.lastInsertId ?? 0;
  }
}

export class UpdateQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private updateData: Partial<InferInsertModel<T>> = {};

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `UPDATE ${table._.name}`;
  }

  set(data: Partial<InferInsertModel<T>>): this {
    this.updateData = { ...this.updateData, ...data };
    return this;
  }

  async execute(): Promise<number> {
    const entries = Object.entries(this.updateData);
    const setClause = entries
      .map(([key]) => {
        const column = (this.table._.columns as any)[key];
        if (!column)
          throw new Error(
            `Column ${key} does not exist on table ${this.table._.name}`
          );
        return `${column._.name} = ?`;
      })
      .join(", ");

    this.query += ` SET ${setClause}`;
    this.params.push(...entries.map(([, value]) => value));

    const { sql, params } = this.build();
    const result = await this.db.execute(sql, ...params);
    return result.rowsAffected;
  }
}

export class DeleteQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  constructor(db: Database, private table: T) {
    super(db);
    this.query = `DELETE FROM ${table._.name}`;
  }

  async execute(): Promise<number> {
    const { sql, params } = this.build();
    const result = await this.db.execute(sql, ...params);
    return result.rowsAffected;
  }
}

// Main ORM Class
export class TauriORM {
  private tables: Map<string, AnyTable> = new Map();

  constructor(
    private db: Database,
    schema: Record<string, AnyTable> | undefined = undefined
  ) {
    if (schema) {
      for (const table of Object.values(schema)) {
        this.tables.set(table._.name, table);
      }
    }
  }

  async migrate(): Promise<void> {
    // Simplified migration implementation
    for (const table of this.tables.values()) {
      const columnsSql = Object.entries(table._.columns)
        .map(([name, col]) => {
          let sql = `${col._.name} ${col.type}`;
          if (col.options.primaryKey) sql += " PRIMARY KEY";
          if (col._.autoincrement) sql += " AUTOINCREMENT";
          if (col._.notNull) sql += " NOT NULL";
          if (col.options.unique) sql += " UNIQUE";
          if (col.options.default !== undefined) {
            const value = col.options.default;
            sql += ` DEFAULT ${
              typeof value === "string" ? `'${value}'` : value
            }`;
          }
          if (col.options.references) {
            sql += ` REFERENCES ${col.options.references.table._.name}(${col.options.references.column._.name})`;
          }
          return sql;
        })
        .join(", ");

      const createSql = `CREATE TABLE IF NOT EXISTS ${table._.name} (${columnsSql})`;
      await this.db.execute(createSql);
    }
  }

  select<
    T extends AnyTable,
    C extends (keyof T["_"]["columns"])[] | undefined = undefined
  >(table: T, columns?: C): SelectQueryBuilder<T, C> {
    return new SelectQueryBuilder(this.db, table, columns);
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
      dv:
        col.options.default &&
        typeof col.options.default === "object" &&
        (col.options.default as any).raw
          ? { raw: (col.options.default as any).raw }
          : col.options.default ?? null,
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

// Relations (simplified for this example)
export const relations = <T extends AnyTable, R extends Record<string, any>>(
  table: T,
  relationsCallback: (helpers: { one: any; many: any }) => R
): R => {
  return relationsCallback({
    one: <U extends AnyTable>(
      table: U,
      config: { fields: [AnySQLiteColumn]; references: [AnySQLiteColumn] }
    ) => ({
      table,
      type: "one" as const,
      foreignKey: config.fields[0],
      localKey: config.references[0],
    }),
    many: <U extends AnyTable>(table: U) => ({
      table,
      type: "many" as const,
    }),
  });
};
