// Define interfaces for our column and table structures
export interface Column<T = any> {
  name: string;
  type: "TEXT" | "INTEGER" | "REAL" | "BLOB";
  isPrimaryKey?: boolean;
  isNotNull?: boolean;
  hasDefault?: boolean;
  // This helps with type inference later
  _dataType: T;
  /**
   * Populated by defineTable so we can reason about relations and aliasing.
   */
  tableName?: string;
}

// Helper functions to define columns, mimicking Drizzle
export const text = (
  name: string,
  config?: { isPrimaryKey?: boolean }
): Column<string> => ({
  name,
  type: "TEXT",
  isPrimaryKey: config?.isPrimaryKey,
  _dataType: "" as string,
});

export const integer = (
  name: string,
  config?: { isPrimaryKey?: boolean }
): Column<number> => ({
  name,
  type: "INTEGER",
  isPrimaryKey: config?.isPrimaryKey,
  _dataType: 0 as number,
});

export const boolean = (name: string): Column<boolean> => ({
  name,
  type: "INTEGER", // SQLite stores booleans as 0 or 1
  _dataType: false as boolean,
});

// A slightly more complex type
export const timestamp = (name: string): Column<Date> => ({
  name,
  type: "INTEGER", // Store timestamps as UNIX epoch milliseconds
  _dataType: new Date(),
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
