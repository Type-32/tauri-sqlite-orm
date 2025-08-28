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
    table: AnyTable;
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
      table: undefined as any,
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
  const table = new Table(tableName, columns);
  for (const col of Object.values(columns)) {
    (col as any)._.table = table;
  }
  return table;
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
