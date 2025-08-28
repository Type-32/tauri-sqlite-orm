// Core Types
import {SQLiteColumn, Table} from "./orm";

export type ColumnDataType = "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
export type Mode = "default" | "timestamp" | "timestamp_ms" | "json";
// Column Value Types Mapping
export type ColumnValueTypes<
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
export type ExtractColumnType<T extends AnySQLiteColumn> = T extends SQLiteColumn<
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
// Table Types
export type AnySQLiteColumn = SQLiteColumn<any, any, any, any, any, any>;
export type AnyTable = Table<Record<string, AnySQLiteColumn>, string>;
// Infer Model Types
export type InferSelectModel<T extends AnyTable> = {
    [K in keyof T["_"]["columns"]]: ExtractColumnType<T["_"]["columns"][K]>;
};
export type RelationType = "one" | "many";

export interface RelationConfig {
    type: RelationType;
    foreignTable: AnyTable;
    fields?: AnySQLiteColumn[];
    references?: AnySQLiteColumn[];
}