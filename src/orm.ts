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
    true,
    THasDefault,
    TAutoincrement
  > {
    return new SQLiteColumn(
      this._.name,
      this.type,
      { ...this.options, primaryKey: true, notNull: true },
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

  as(
    alias: string
  ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement> {
    // This is a placeholder for alias functionality
    return this;
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

type IsOptionalOnInsert<C extends AnySQLiteColumn> =
  C["_"]["notNull"] extends false
    ? true
    : C["_"]["hasDefault"] extends true
    ? true
    : C["_"]["autoincrement"] extends true
    ? true
    : false;

type OptionalColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
  [K in keyof TColumns]: IsOptionalOnInsert<TColumns[K]> extends true
    ? K
    : never;
}[keyof TColumns];

type RequiredColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
  [K in keyof TColumns]: IsOptionalOnInsert<TColumns[K]> extends true
    ? never
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
});

export const asc = (column: AnySQLiteColumn) => ({
  sql: `${column._.name} ASC`,
  params: [],
});

export const desc = (column: AnySQLiteColumn) => ({
  sql: `${column._.name} DESC`,
  params: [],
});

// Aggregation functions
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

// SQL template tag
export const sql = <T = unknown>(
  strings: TemplateStringsArray,
  ...values: any[]
): { sql: string; params: any[]; mapWith?: (value: any) => T } => {
  const queryParts: string[] = [];
  const params: any[] = [];

  strings.forEach((str, i) => {
    queryParts.push(str);
    if (values[i] !== undefined) {
      if (typeof values[i] === "object" && values[i].sql) {
        queryParts.push(values[i].sql);
        params.push(...values[i].params);
      } else {
        queryParts.push("?");
        params.push(values[i]);
      }
    }
  });

  return {
    sql: queryParts.join(""),
    params,
  };
};

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

  orderBy(
    column: AnySQLiteColumn | { sql: string; params: any[] },
    direction: "ASC" | "DESC" = "ASC"
  ): this {
    if ("sql" in column) {
      this.query += ` ORDER BY ${column.sql} ${direction}`;
      this.params.push(...column.params);
    } else {
      this.query += ` ORDER BY ${column._.name} ${direction}`;
    }
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
  private isDistinct = false;
  private groupByColumns: AnySQLiteColumn[] = [];
  private havingCondition: SQLCondition | null = null;

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

  distinct(): this {
    this.isDistinct = true;
    this.query = this.query.replace("SELECT", "SELECT DISTINCT");
    return this;
  }

  groupBy(...columns: AnySQLiteColumn[]): this {
    this.groupByColumns.push(...columns);
    const columnNames = columns.map((col) => col._.name).join(", ");
    this.query += ` GROUP BY ${columnNames}`;
    return this;
  }

  having(condition: SQLCondition): this {
    this.havingCondition = condition;
    this.query += ` HAVING ${condition.sql}`;
    this.params.push(...condition.params);
    return this;
  }

  async execute(): Promise<
    TSelectedColumns extends (keyof TTable["_"]["columns"])[]
      ? Pick<InferSelectModel<TTable>, TSelectedColumns[number]>[]
      : InferSelectModel<TTable>[]
  > {
    const { sql, params } = this.build();
    return this.db.select(sql, params) as any;
  }

  async all(): Promise<
    TSelectedColumns extends (keyof TTable["_"]["columns"])[]
      ? Pick<InferSelectModel<TTable>, TSelectedColumns[number]>[]
      : InferSelectModel<TTable>[]
  > {
    return this.execute();
  }

  async get(): Promise<
    TSelectedColumns extends (keyof TTable["_"]["columns"])[]
      ? Pick<InferSelectModel<TTable>, TSelectedColumns[number]> | undefined
      : InferSelectModel<TTable> | undefined
  > {
    this.limit(1);
    const result = await this.execute();
    return result[0] as any;
  }
}

export class InsertQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private dataSets: InferInsertModel<T>[] = [];
  private returningColumns: (keyof T["_"]["columns"])[] = [];
  private onConflictAction: "nothing" | "update" | null = null;
  private conflictTarget: AnySQLiteColumn[] = [];
  private updateSet: Partial<InferInsertModel<T>> = {};

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `INSERT INTO ${table._.name}`;
  }

  values(data: InferInsertModel<T> | InferInsertModel<T>[]): this {
    const dataArray = Array.isArray(data) ? data : [data];
    this.dataSets.push(...dataArray);
    return this;
  }

  returning(...columns: (keyof T["_"]["columns"])[]): this {
    this.returningColumns = columns;
    return this;
  }

  onConflictDoNothing(target?: AnySQLiteColumn | AnySQLiteColumn[]): this {
    this.onConflictAction = "nothing";
    if (target) {
      this.conflictTarget = Array.isArray(target) ? target : [target];
    }
    return this;
  }

  onConflictDoUpdate(config: {
    target: AnySQLiteColumn | AnySQLiteColumn[];
    set: Partial<InferInsertModel<T>>;
  }): this {
    this.onConflictAction = "update";
    this.conflictTarget = Array.isArray(config.target)
      ? config.target
      : [config.target];
    this.updateSet = config.set;
    return this;
  }

  private processDefaultValues(
    data: InferInsertModel<T>
  ): Partial<InferInsertModel<T>> {
    const finalData: Partial<InferInsertModel<T>> = { ...data };

    for (const [key, column] of Object.entries(this.table._.columns)) {
      const typedKey = key as keyof T["_"]["columns"];

      if ((finalData as any)[typedKey] === undefined) {
        if (column.options.$defaultFn) {
          (finalData as any)[typedKey] = column.options.$defaultFn();
        }
      }
    }

    return finalData;
  }

  private buildConflictClause(): string {
    if (!this.onConflictAction) return "";

    let clause = " ON CONFLICT";

    if (this.conflictTarget.length > 0) {
      const targetNames = this.conflictTarget
        .map((col) => col._.name)
        .join(", ");
      clause += ` (${targetNames})`;
    }

    if (this.onConflictAction === "nothing") {
      clause += " DO NOTHING";
    } else if (this.onConflictAction === "update") {
      const setEntries = Object.entries(this.updateSet);
      if (setEntries.length > 0) {
        const setClause = setEntries.map(([key]) => `${key} = ?`).join(", ");
        clause += ` DO UPDATE SET ${setClause}`;
      }
    }

    return clause;
  }

  async execute(): Promise<
    T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
  > {
    if (this.dataSets.length === 0) {
      throw new Error("No data provided for insert");
    }

    const processedDataSets = this.dataSets.map((data) =>
      this.processDefaultValues(data)
    );

    // Group data by column sets for batch insertion
    const groups = new Map<string, Partial<InferInsertModel<T>>[]>();
    for (const dataSet of processedDataSets) {
      const keys = Object.keys(dataSet).sort().join(",");
      if (!groups.has(keys)) {
        groups.set(keys, []);
      }
      groups.get(keys)!.push(dataSet);
    }

    let results: any[] = [];
    let lastInsertId: number | undefined;
    let rowsAffected = 0;

    for (const [_, dataSets] of groups) {
      const columns = Object.keys(dataSets[0]) as (keyof T["_"]["columns"])[];
      const columnNames = columns.map(
        (key) => this.table._.columns[key as string]._.name
      );
      const placeholders = `(${columns.map(() => "?").join(", ")})`;
      const valuesSql = dataSets.map(() => placeholders).join(", ");
      const conflictClause = this.buildConflictClause();

      const finalQuery = `${this.query} (${columnNames.join(
        ", "
      )}) VALUES ${valuesSql}${conflictClause}`;

      const params = dataSets.flatMap((data) =>
        columns.map((col) => (data as any)[col] ?? null)
      );

      // Add conflict update params
      if (this.onConflictAction === "update") {
        const setValues = Object.entries(this.updateSet).map(
          ([, value]) => value
        );
        params.push(...setValues);
      }

      if (this.returningColumns.length > 0) {
        const returningNames = this.returningColumns
          .map((col) => this.table._.columns[col as string]._.name)
          .join(", ");
        const queryWithReturning = `${finalQuery} RETURNING ${returningNames}`;
        const rows = await this.db.select(queryWithReturning, params);
        results = results.concat(rows);
      } else {
        const result = await this.db.execute(finalQuery, params);
        lastInsertId = result.lastInsertId;
        rowsAffected += result.rowsAffected;
      }
    }

    if (this.returningColumns.length > 0) {
      return results as any;
    }

    return [{ lastInsertId, rowsAffected }] as any;
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

export class UpdateQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private updateData: Partial<InferInsertModel<T>> = {};
  private returningColumns: (keyof T["_"]["columns"])[] = [];

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `UPDATE ${table._.name}`;
  }

  set(data: Partial<InferInsertModel<T>>): this {
    this.updateData = { ...this.updateData, ...data };
    return this;
  }

  returning(...columns: (keyof T["_"]["columns"])[]): this {
    this.returningColumns = columns;
    return this;
  }

  private buildUpdateClause(): { sql: string; params: any[] } {
    const finalUpdateData = { ...this.updateData };

    // Apply $onUpdateFn for columns that don't have explicit values
    for (const [key, column] of Object.entries(this.table._.columns)) {
      const typedKey = key as keyof T["_"]["columns"];

      if (
        (finalUpdateData as any)[typedKey] === undefined &&
        column.options.$onUpdateFn
      ) {
        (finalUpdateData as any)[typedKey] = column.options.$onUpdateFn();
      }
    }

    const baseQuery = this.query;
    const whereParams = this.params;

    let tablePart = baseQuery;
    let whereClause = "";
    const whereIndex = baseQuery.indexOf(" WHERE ");
    if (whereIndex !== -1) {
      tablePart = baseQuery.substring(0, whereIndex);
      whereClause = baseQuery.substring(whereIndex);
    }

    const entries = Object.entries(finalUpdateData);
    if (entries.length === 0) {
      throw new Error("Cannot execute an update query without a .set() call.");
    }

    const setClause = entries
      .map(([key]) => {
        const column = (this.table._.columns as any)[key];
        if (!column) {
          throw new Error(
            `Column ${key} does not exist on table ${this.table._.name}`
          );
        }
        return `${column._.name} = ?`;
      })
      .join(", ");

    const setParams = entries.map(([, value]) => value);

    const sql = `${tablePart} SET ${setClause}${whereClause}`;
    const params = [...setParams, ...whereParams];

    return { sql, params };
  }

  async execute(): Promise<
    T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
  > {
    const { sql: updateSql, params } = this.buildUpdateClause();

    if (this.returningColumns.length > 0) {
      const returningNames = this.returningColumns
        .map((col) => this.table._.columns[col as string]._.name)
        .join(", ");
      const sqlWithReturning = `${updateSql} RETURNING ${returningNames}`;
      return this.db.select(sqlWithReturning, params) as any;
    } else {
      const result = await this.db.execute(updateSql, params);
      return [{ rowsAffected: result.rowsAffected }] as any;
    }
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

export class DeleteQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private returningColumns: (keyof T["_"]["columns"])[] = [];

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `DELETE FROM ${table._.name}`;
  }

  returning(...columns: (keyof T["_"]["columns"])[]): this {
    this.returningColumns = columns;
    return this;
  }

  async execute(): Promise<
    T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
  > {
    const { sql, params } = this.build();

    if (this.returningColumns.length > 0) {
      const returningNames = this.returningColumns
        .map((col) => this.table._.columns[col as string]._.name)
        .join(", ");
      const sqlWithReturning = `${sql} RETURNING ${returningNames}`;
      return this.db.select(sqlWithReturning, params) as any;
    } else {
      const result = await this.db.execute(sql, params);
      return [{ rowsAffected: result.rowsAffected }] as any;
    }
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

// With clause support
export class WithQueryBuilder {
  private ctes: Array<{ alias: string; query: string; params: any[] }> = [];

  constructor(private db: Database) {}

  with(alias: string, query: { sql: string; params: any[] }): this {
    this.ctes.push({ alias, query: query.sql, params: query.params });
    return this;
  }

  select<
    T extends AnyTable,
    C extends (keyof T["_"]["columns"])[] | undefined = undefined
  >(table: T, columns?: C): SelectQueryBuilder<T, C> {
    const builder = new SelectQueryBuilder(this.db, table, columns);
    this.applyWithClause(builder);
    return builder;
  }

  insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
    const builder = new InsertQueryBuilder(this.db, table);
    this.applyWithClause(builder);
    return builder;
  }

  update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
    const builder = new UpdateQueryBuilder(this.db, table);
    this.applyWithClause(builder);
    return builder;
  }

  delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
    const builder = new DeleteQueryBuilder(this.db, table);
    this.applyWithClause(builder);
    return builder;
  }

  private applyWithClause(builder: BaseQueryBuilder): void {
    if (this.ctes.length > 0) {
      const cteSql = this.ctes
        .map((cte) => `${cte.alias} AS (${cte.query})`)
        .join(", ");
      builder["query"] = `WITH ${cteSql} ${builder["query"]}`;

      // Add CTE params to the beginning of the params array
      builder["params"] = [
        ...this.ctes.flatMap((cte) => cte.params),
        ...builder["params"],
      ];
    }
  }
}

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

// Helper functions
export const getTableColumns = <T extends AnyTable>(table: T) => {
  return table._.columns;
};

export const alias = <T extends AnyTable>(
  table: T,
  alias: string
): Table<T["_"]["columns"], T["_"]["name"]> => {
  // This is a placeholder for alias functionality
  return table as any;
};
