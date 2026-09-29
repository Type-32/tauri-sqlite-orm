// Column helpers
import { SQLiteColumn } from './orm'
import { Mode } from './types'

// Overloads for text() to handle config presence and infer literal types
export function text<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'TEXT', 'default', false, false, false, never, never>

export function text<
    TName extends string,
    const TConfig extends { mode?: 'default' | 'json'; enum?: readonly string[] }
>(
    name: TName,
    config: TConfig
): SQLiteColumn<
    TName,
    'TEXT',
    TConfig['mode'] extends 'json' ? 'json' : 'default',
    false,
    false,
    false,
    TConfig['enum'] extends readonly string[] ? TConfig['enum'] : never,
    never
>

export function text(name: string, config?: any): any {
    return new SQLiteColumn(name, 'TEXT', config)
}

// Overloads for integer() to handle config presence and infer literal mode types
export function integer<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'INTEGER', 'default', false, false, false, never, never>

export function integer<TName extends string, const TConfig extends { mode: Mode }>(
    name: TName,
    config: TConfig
): SQLiteColumn<TName, 'INTEGER', TConfig['mode'], false, false, false, never, never>

export function integer(name: string, config?: any): any {
    return new SQLiteColumn(name, 'INTEGER', config)
}

export const real = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'REAL', 'default', false, false, false, never, never>(name, 'REAL')

// Overloads for blob() to handle config presence and infer literal mode types
export function blob<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'BLOB', 'default', false, false, false, never, never>

export function blob<TName extends string, const TConfig extends { mode: 'json' | 'bigint' | 'default' }>(
    name: TName,
    config: TConfig
): SQLiteColumn<TName, 'BLOB', TConfig['mode'], false, false, false, never, never>

export function blob(name: string, config?: any): any {
    return new SQLiteColumn(name, 'BLOB', config)
}

export const boolean = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'BOOLEAN', 'default', false, false, false, never, never>(name, 'BOOLEAN')

// Overloads for numeric() to handle config presence and infer literal mode types
export function numeric<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'NUMERIC', 'default', false, false, false, never, never>

export function numeric<TName extends string, const TConfig extends { mode: 'bigint' | 'default' }>(
    name: TName,
    config: TConfig
): SQLiteColumn<TName, 'NUMERIC', TConfig['mode'], false, false, false, never, never>

export function numeric(name: string, config?: any): any {
    return new SQLiteColumn(name, 'NUMERIC', config)
}

export const enumType = <TName extends string, TValues extends readonly [string, ...string[]]>(
    name: TName,
    values: TValues
) => text(name, { enum: values })
