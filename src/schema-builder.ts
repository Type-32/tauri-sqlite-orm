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
type ColumnBuilder<T> = Column<T> & {
  primaryKey: (opts?: { autoIncrement?: boolean }) => ColumnBuilder<T>;
  notNull: () => ColumnBuilder<T>;
  default: (value: T | SQLExpression) => ColumnBuilder<T>;
  $type: <U>() => ColumnBuilder<U>;
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

export function text<TEnum extends string>(
  name: string,
  config?: { isPrimaryKey?: boolean; enum?: readonly TEnum[] }
): ColumnBuilder<TEnum extends string ? TEnum : string> {
  const col = createColumn<string>({
    name,
    type: "TEXT",
    isPrimaryKey: config?.isPrimaryKey,
    _dataType: "" as string,
  });
  if (config?.enum) (col as any).enumValues = config.enum;
  return col as any;
}

export function integer(
  name: string,
  config?: {
    isPrimaryKey?: boolean;
    mode?: "number" | "boolean" | "timestamp";
    autoIncrement?: boolean;
  }
): ColumnBuilder<number | boolean | Date> {
  let dt: any = 0 as number;
  if (config?.mode === "boolean") dt = false as boolean;
  if (config?.mode === "timestamp") dt = new Date();
  const col = createColumn<any>({
    name,
    type: "INTEGER",
    isPrimaryKey: config?.isPrimaryKey,
    autoIncrement: config?.autoIncrement,
    mode: config?.mode ?? "number",
    _dataType: dt,
  });
  return col as any;
}

export function real(name: string): ColumnBuilder<number> {
  return createColumn<number>({ name, type: "REAL", _dataType: 0 as number });
}

export function blob(
  name: string,
  config?: { mode?: "json" | "bigint" }
): ColumnBuilder<unknown | bigint | Uint8Array> {
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

export function numeric(
  name: string,
  config?: { mode?: "string" | "number" | "bigint" }
): ColumnBuilder<string | number | bigint> {
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

export const boolean = (name: string): ColumnBuilder<boolean> =>
  createColumn<boolean>({
    name,
    type: "INTEGER",
    _dataType: false as boolean,
    mode: "boolean",
  });

// A slightly more complex type
export const timestamp = (name: string): ColumnBuilder<Date> =>
  createColumn<Date>({
    name,
    type: "INTEGER",
    _dataType: new Date(),
    mode: "timestamp",
  });

// Define a type for the schema object passed to defineTable
type SchemaDefinition = Record<string, Column<any>>;

// The magic happens here: Infer TypeScript types from the schema
type InferModel<T extends SchemaDefinition> = {
  [K in keyof T]: T[K]["_dataType"];
};

// Our main table definition function
export function defineTable<T extends SchemaDefinition>(
  tableName: string,
  schema: T
) {
  // Attach table name to each column and expose columns at the top-level of the table object
  const finalizedSchema = { ...schema } as T;
  for (const key of Object.keys(finalizedSchema)) {
    const col = finalizedSchema[key as keyof T] as Column<any>;
    (col as Column<any>).tableName = tableName;
  }

  const table: any = {
    _tableName: tableName,
    _schema: finalizedSchema,
    // The Drizzle-like type inference properties
    $inferSelect: {} as InferModel<T>,
    $inferInsert: {} as Omit<InferModel<T>, "id">, // Example: omit 'id' for inserts
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
