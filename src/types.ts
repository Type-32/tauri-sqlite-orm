// Core Types
import { SQLiteColumn, Table } from './orm'

export type ColumnDataType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'NUMERIC'
export type Mode = 'default' | 'timestamp' | 'timestamp_ms' | 'json' | 'boolean' | 'bigint'
// Column Value Types Mapping
export type ColumnValueTypes<TType extends ColumnDataType, TMode extends Mode> = TType extends 'TEXT'
    ? TMode extends 'json'
        ? unknown // Use unknown instead of any for JSON - requires $type<T>() for proper typing
        : string
    : TType extends 'INTEGER'
    ? TMode extends 'timestamp' | 'timestamp_ms'
        ? Date
        : TMode extends 'boolean'
        ? boolean
        : number
    : TType extends 'REAL'
    ? number
    : TType extends 'BOOLEAN'
    ? boolean
    : TType extends 'BLOB'
    ? TMode extends 'json'
        ? unknown // Use unknown instead of any for JSON - requires $type<T>() for proper typing
        : TMode extends 'bigint'
        ? bigint
        : Uint8Array
    : TType extends 'NUMERIC'
    ? TMode extends 'bigint'
        ? bigint
        : number
    : never

// Column Options
export interface ColumnOptions<TData, TEnum extends readonly string[] = readonly string[]> {
    notNull?: boolean
    default?: TData
    $defaultFn?: () => TData
    primaryKey?: boolean
    autoincrement?: boolean
    unique?: boolean
    references?: {
        table: AnyTable
        column: AnySQLiteColumn
    }
    mode?: Mode
    $onUpdateFn?: () => TData
    enum?: TEnum
}

// Extract column value type for SELECT queries
// For SELECT: only notNull matters for nullability (defaults/autoincrement don't make DB value non-null)
export type ExtractColumnType<T extends AnySQLiteColumn> = 
    T extends SQLiteColumn<infer _, infer TType, infer TMode, infer TNotNull, infer THasDefault, infer TAutoincrement, infer TEnum, infer TCustomType>
        ? // First check if custom type is set (from $type<T>())
          [TCustomType] extends [never]
        ? // No custom type, check if it's an enum
              [TEnum] extends [never]
                ? // Not an enum, use ColumnValueTypes
                  TNotNull extends true
                    ? ColumnValueTypes<TType, TMode> // Non-nullable
                    : ColumnValueTypes<TType, TMode> | null // Nullable
                : // Enum type - return union of enum values, add null if nullable
                  TNotNull extends true
                    ? TEnum[number]
                    : TEnum[number] | null
            : // Custom type is set - use it and respect notNull
              TNotNull extends true
                ? TCustomType // Non-nullable custom type
                : TCustomType | null // Nullable custom type
                : never
// Table Types
export type AnySQLiteColumn = SQLiteColumn<any, any, any, any, any, any, any, any>
export type AnyTable = Table<Record<string, AnySQLiteColumn>, string>
// Infer Model Types
export type InferSelectModel<T extends AnyTable> = {
    [K in keyof T['_']['columns']]: ExtractColumnType<T['_']['columns'][K]>
}
export type RelationType = 'one' | 'many' | 'manyToMany'

export interface RelationConfig {
    type: RelationType
    foreignTable: AnyTable
    fields?: AnySQLiteColumn[]
    references?: AnySQLiteColumn[]
    // Many-to-many specific fields
    junctionTable?: AnyTable
    junctionFields?: AnySQLiteColumn[] // columns in junction table that reference this table
    junctionReferences?: AnySQLiteColumn[] // columns in junction table that reference the foreign table
}
