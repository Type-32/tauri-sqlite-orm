// Define interfaces for our column and table structures
export type UpdateDeleteAction =
  | "cascade"
  | "restrict"
  | "no action"
  | "set null"
  | "set default";

export interface SQLExpression {
  raw: string;
}

export function sql(
  strings: TemplateStringsArray,
  ...values: any[]
): SQLExpression {
  const raw = strings.reduce(
    (acc, part, idx) =>
      acc + part + (idx < values.length ? String(values[idx]) : ""),
    ""
  );
  return { raw };
}

export interface Column<T = any> {
  name: string;
  type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "NUMERIC";
  isPrimaryKey?: boolean;
  autoIncrement?: boolean;
  isNotNull?: boolean;
  defaultValue?: T | SQLExpression;
  defaultFn?: () => any;
  onUpdateFn?: () => any;
  references?: {
    table: string;
    column: string;
    onDelete?: UpdateDeleteAction;
    onUpdate?: UpdateDeleteAction;
  };
  enumValues?: readonly string[];
  mode?: string;
  // This helps with type inference later
  _dataType: T;
  /**
   * Populated by defineTable so we can reason about relations and aliasing.
   */
  tableName?: string;
}

// Helper functions to define columns, mimicking Drizzle
export type ColumnBuilder<T> = Column<T> & {
  primaryKey: (opts?: { autoIncrement?: boolean }) => ColumnBuilder<T>;
  notNull: () => ColumnBuilder<T>;
  default: (value: T | SQLExpression) => ColumnBuilder<T>;
  $type: <U>() => ColumnBuilder<U>;
  $defaultFn: (fn: () => any) => ColumnBuilder<T>;
  $default: (fn: () => any) => ColumnBuilder<T>;
  $onUpdate: (fn: () => any) => ColumnBuilder<T>;
  $onUpdateFn: (fn: () => any) => ColumnBuilder<T>;
  references: (
    target: () => Column<any>,
    actions?: { onDelete?: UpdateDeleteAction; onUpdate?: UpdateDeleteAction }
  ) => ColumnBuilder<T>;
};

function createColumn<T>(
  params: Omit<Column<T>, "_dataType"> & { _dataType: T }
): ColumnBuilder<T> {
  const col: any = { ...params };
  col.primaryKey = (opts?: { autoIncrement?: boolean }) => {
    col.isPrimaryKey = true;
    if (opts?.autoIncrement) col.autoIncrement = true;
    return col;
  };
  col.notNull = () => {
    col.isNotNull = true;
    return col;
  };
  col.default = (value: any) => {
    col.defaultValue = value;
    return col;
  };
  col.$type = <U>() => col as unknown as ColumnBuilder<U>;
  col.$defaultFn = (fn: () => any) => {
    col.defaultFn = fn;
    return col;
  };
  col.$default = (fn: () => any) => {
    col.defaultFn = fn;
    return col;
  };
  col.$onUpdate = (fn: () => any) => {
    col.onUpdateFn = fn;
    return col;
  };
  col.$onUpdateFn = (fn: () => any) => {
    col.onUpdateFn = fn;
    return col;
  };
  col.references = (
    target: () => Column<any>,
    actions?: { onDelete?: UpdateDeleteAction; onUpdate?: UpdateDeleteAction }
  ) => {
    const t = target();
    col.references = {
      table: t.tableName!,
      column: t.name,
      onDelete: actions?.onDelete,
      onUpdate: actions?.onUpdate,
    };
    return col;
  };
  return col as ColumnBuilder<T>;
}

// --- Column builders with name-optional overloads ---

type TextConfig<TEnum extends string> = {
  enum?: readonly TEnum[];
  mode?: "json";
};
export function text<TEnum extends string>(
  name: string,
  config?: TextConfig<TEnum>
): ColumnBuilder<TEnum extends string ? TEnum : string>;
export function text<TEnum extends string>(
  config?: TextConfig<TEnum>
): ColumnBuilder<TEnum extends string ? TEnum : string>;
export function text<TEnum extends string>(
  nameOrConfig?: string | TextConfig<TEnum>,
  maybeConfig?: TextConfig<TEnum>
): ColumnBuilder<TEnum extends string ? TEnum : string> {
  const name = typeof nameOrConfig === "string" ? nameOrConfig : "";
  const config = (
    typeof nameOrConfig === "string" ? maybeConfig : nameOrConfig
  ) as TextConfig<TEnum> | undefined;
  const col = createColumn<string>({
    name,
    type: "TEXT",
    _dataType: "" as string,
  });
  if (config?.enum) (col as any).enumValues = config.enum;
  if (config?.mode) (col as any).mode = config.mode;
  return col as any;
}

export type IntegerMode = "number" | "boolean" | "timestamp" | "timestamp_ms";
export function integer(
  name: string,
  config?: { mode?: IntegerMode }
): ColumnBuilder<number | boolean | Date>;
export function integer(config?: {
  mode?: IntegerMode;
}): ColumnBuilder<number | boolean | Date>;
export function integer(
  nameOrConfig?: string | { mode?: IntegerMode },
  maybeConfig?: { mode?: IntegerMode }
): ColumnBuilder<number | boolean | Date> {
  const name = typeof nameOrConfig === "string" ? nameOrConfig : "";
  const config = (
    typeof nameOrConfig === "string" ? maybeConfig : nameOrConfig
  ) as { mode?: IntegerMode } | undefined;
  let dt: any = 0 as number;
  if (config?.mode === "boolean") dt = false as boolean;
  if (config?.mode === "timestamp" || config?.mode === "timestamp_ms")
    dt = new Date();
  const col = createColumn<any>({
    name,
    type: "INTEGER",
    mode: config?.mode ?? "number",
    _dataType: dt,
  });
  return col as any;
}

export function real(name: string): ColumnBuilder<number>;
export function real(): ColumnBuilder<number>;
export function real(name?: string): ColumnBuilder<number> {
  return createColumn<number>({
    name: name ?? "",
    type: "REAL",
    _dataType: 0 as number,
  });
}

export type BlobMode = "json" | "bigint" | "buffer";
export function blob(
  name: string,
  config?: { mode?: BlobMode }
): ColumnBuilder<unknown | bigint | Uint8Array>;
export function blob(config?: {
  mode?: BlobMode;
}): ColumnBuilder<unknown | bigint | Uint8Array>;
export function blob(
  nameOrConfig?: string | { mode?: BlobMode },
  maybeConfig?: { mode?: BlobMode }
): ColumnBuilder<unknown | bigint | Uint8Array> {
  const name = typeof nameOrConfig === "string" ? nameOrConfig : "";
  const config = (
    typeof nameOrConfig === "string" ? maybeConfig : nameOrConfig
  ) as { mode?: BlobMode } | undefined;
  let dt: any = new Uint8Array();
  if (config?.mode === "bigint") dt = 0n as bigint;
  if (config?.mode === "json") dt = undefined as unknown;
  return createColumn<any>({
    name,
    type: "BLOB",
    mode: config?.mode,
    _dataType: dt,
  });
}

export type NumericMode = "string" | "number" | "bigint";
export function numeric(
  name: string,
  config?: { mode?: NumericMode }
): ColumnBuilder<string | number | bigint>;
export function numeric(config?: {
  mode?: NumericMode;
}): ColumnBuilder<string | number | bigint>;
export function numeric(
  nameOrConfig?: string | { mode?: NumericMode },
  maybeConfig?: { mode?: NumericMode }
): ColumnBuilder<string | number | bigint> {
  const name = typeof nameOrConfig === "string" ? nameOrConfig : "";
  const config = (
    typeof nameOrConfig === "string" ? maybeConfig : nameOrConfig
  ) as { mode?: NumericMode } | undefined;
  let dt: any = "" as string;
  if (config?.mode === "number") dt = 0 as number;
  if (config?.mode === "bigint") dt = 0n as bigint;
  return createColumn<any>({
    name,
    type: "NUMERIC",
    mode: config?.mode,
    _dataType: dt,
  });
}

export function boolean(name: string): ColumnBuilder<boolean>;
export function boolean(): ColumnBuilder<boolean>;
export function boolean(name?: string): ColumnBuilder<boolean> {
  return createColumn<boolean>({
    name: name ?? "",
    type: "INTEGER",
    _dataType: false as boolean,
    mode: "boolean",
  });
}

export function timestamp(name: string): ColumnBuilder<Date>;
export function timestamp(): ColumnBuilder<Date>;
export function timestamp(name?: string): ColumnBuilder<Date> {
  return createColumn<Date>({
    name: name ?? "",
    type: "INTEGER",
    _dataType: new Date(),
    mode: "timestamp",
  });
}

// Sugar for INTEGER PRIMARY KEY AUTOINCREMENT
export function increments(name: string): ColumnBuilder<number>;
export function increments(): ColumnBuilder<number>;
export function increments(name?: string): ColumnBuilder<number> {
  return integer(name ?? "").primaryKey({
    autoIncrement: true,
  }) as unknown as ColumnBuilder<number>;
}

// Define a type for the schema object passed to defineTable
type SchemaDefinition = Record<string, Column<any>>;

// The magic happens here: Infer TypeScript types from the schema
type InferModel<T extends SchemaDefinition> = {
  [K in keyof T]: T[K]["_dataType"];
};

type KeysMarkedPrimary<T extends SchemaDefinition> = {
  [K in keyof T]: T[K] extends { isPrimaryKey: true } ? K : never;
}[keyof T];

// Our main table definition function
export function defineTable<T extends SchemaDefinition>(
  tableName: string,
  schema: T
) {
  // Attach table name to each column and expose columns at the top-level of the table object
  const finalizedSchema = { ...schema } as T;
  for (const key of Object.keys(finalizedSchema)) {
    const col = finalizedSchema[key as keyof T] as Column<any>;
    if (!col.name || col.name === "") (col as Column<any>).name = key;
    (col as Column<any>).tableName = tableName;
  }

  const table: any = {
    _tableName: tableName,
    _schema: finalizedSchema,
    // The Drizzle-like type inference properties
    $inferSelect: {} as InferModel<T>,
    $inferInsert: {} as Omit<InferModel<T>, KeysMarkedPrimary<T>>, // omit PK columns
  };

  // Hoist columns onto the table object so you can do users.id
  for (const [key, col] of Object.entries(finalizedSchema)) {
    table[key] = col;
  }

  return table as typeof table & InferModel<T>;
}

export type Table<T extends SchemaDefinition> = ReturnType<
  typeof defineTable<T>
>;
