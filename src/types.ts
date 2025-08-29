// Core Types
import { SQLiteColumn, Table } from './orm'

export type ColumnDataType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'NUMERIC'
export type Mode = 'default' | 'timestamp' | 'timestamp_ms' | 'json' | 'boolean' | 'bigint'
// Column Value Types Mapping
export type ColumnValueTypes<TType extends ColumnDataType, TMode extends Mode> = TType extends 'TEXT'
    ? TMode extends 'json'
        ? any
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
        ? any
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

// Extract column value type
export type ExtractColumnType<T extends AnySQLiteColumn> = T['_']['customType'] extends never
    ? T['_']['enum'] extends readonly string[]
        ? T['_']['enum'][number]
        : T extends SQLiteColumn<infer _, infer TType, infer TMode, infer TNotNull, infer THasDefault>
        ? THasDefault extends true
            ? TNotNull extends true
                ? ColumnValueTypes<TType, TMode>
                : ColumnValueTypes<TType, TMode> | null | undefined
            : TNotNull extends true
            ? ColumnValueTypes<TType, TMode>
            : ColumnValueTypes<TType, TMode> | null | undefined
        : never
    : T['_']['customType']
// Table Types
export type AnySQLiteColumn = SQLiteColumn<any, any, any, any, any, any, any, any>
export type AnyTable = Table<Record<string, AnySQLiteColumn>, string>
// Infer Model Types
export type InferSelectModel<T extends AnyTable> = {
    [K in keyof T['_']['columns']]: ExtractColumnType<T['_']['columns'][K]>
}
export type RelationType = 'one' | 'many'

export interface RelationConfig {
    type: RelationType
    foreignTable: AnyTable
    fields?: AnySQLiteColumn[]
    references?: AnySQLiteColumn[]
}
