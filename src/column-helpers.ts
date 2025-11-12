// Column helpers
import { SQLiteColumn } from './orm'
import { Mode } from './types'

// Overloads for text() to handle config presence correctly
export function text<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'TEXT', 'default', false, false, false, never, never>

export function text<
    TName extends string,
    TMode extends 'default' | 'json',
    TEnum extends readonly string[]
>(
    name: TName,
    config: { mode?: TMode; enum?: TEnum }
): SQLiteColumn<TName, 'TEXT', TMode extends undefined ? 'default' : TMode, false, false, false, TEnum, never>

export function text<
    TName extends string,
    TMode extends 'default' | 'json' = 'default',
    TEnum extends readonly string[] = never
>(
    name: TName,
    config?: { mode?: TMode; enum?: TEnum }
): SQLiteColumn<TName, 'TEXT', TMode, false, false, false, TEnum, never> {
    return new SQLiteColumn<TName, 'TEXT', any, false, false, false, any, never>(name, 'TEXT', config as any)
}

// Overloads for integer() to handle config presence correctly
export function integer<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'INTEGER', 'default', false, false, false, never, never>

export function integer<TName extends string, TMode extends Mode>(
    name: TName,
    config: { mode?: TMode }
): SQLiteColumn<TName, 'INTEGER', TMode extends undefined ? 'default' : TMode, false, false, false, never, never>

export function integer<TName extends string, TMode extends Mode = 'default'>(
    name: TName,
    config?: { mode?: TMode }
): SQLiteColumn<TName, 'INTEGER', TMode, false, false, false, never, never> {
    return new SQLiteColumn<TName, 'INTEGER', any, false, false, false, never, never>(name, 'INTEGER', config as any)
}

export const real = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'REAL', 'default', false, false, false, never, never>(name, 'REAL')

// Overloads for blob() to handle config presence correctly
export function blob<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'BLOB', 'default', false, false, false, never, never>

export function blob<TName extends string, TMode extends 'json' | 'bigint' | 'default'>(
    name: TName,
    config: { mode?: TMode }
): SQLiteColumn<TName, 'BLOB', TMode extends undefined ? 'default' : TMode, false, false, false, never, never>

export function blob<TName extends string, TMode extends 'json' | 'bigint' | 'default' = 'default'>(
    name: TName,
    config?: { mode?: TMode }
): SQLiteColumn<TName, 'BLOB', TMode, false, false, false, never, never> {
    return new SQLiteColumn<TName, 'BLOB', any, false, false, false, never, never>(name, 'BLOB', config as any)
}

export const boolean = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'BOOLEAN', 'default', false, false, false, never, never>(name, 'BOOLEAN')

// Overloads for numeric() to handle config presence correctly
export function numeric<TName extends string>(
    name: TName
): SQLiteColumn<TName, 'NUMERIC', 'default', false, false, false, never, never>

export function numeric<TName extends string, TMode extends 'bigint' | 'default'>(
    name: TName,
    config: { mode?: TMode }
): SQLiteColumn<TName, 'NUMERIC', TMode extends undefined ? 'default' : TMode, false, false, false, never, never>

export function numeric<TName extends string, TMode extends 'bigint' | 'default' = 'default'>(
    name: TName,
    config?: { mode?: TMode }
): SQLiteColumn<TName, 'NUMERIC', TMode, false, false, false, never, never> {
    return new SQLiteColumn<TName, 'NUMERIC', any, false, false, false, never, never>(name, 'NUMERIC', config as any)
}

export const enumType = <TName extends string, TValues extends readonly [string, ...string[]]>(
    name: TName,
    values: TValues
) => text(name, { enum: values })
