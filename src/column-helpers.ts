// Column helpers
import { SQLiteColumn } from './orm'
import { Mode } from './types'

export const text = <
    TName extends string,
    TMode extends 'default' | 'json' = 'default',
    TEnum extends readonly string[] = never
>(
    name: TName,
    config?: { mode?: TMode; enum?: TEnum }
) => new SQLiteColumn<TName, 'TEXT', TMode, false, false, false, TEnum, never>(name, 'TEXT', config as any)

export const integer = <
    TName extends string,
    TMode extends Mode = 'default'
>(
    name: TName,
    config?: { mode?: TMode }
) => new SQLiteColumn<TName, 'INTEGER', TMode, false, false, false, never, never>(name, 'INTEGER', config as any)

export const real = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'REAL', 'default', false, false, false, never, never>(name, 'REAL')

export const blob = <
    TName extends string,
    TMode extends 'json' | 'bigint' | 'default' = 'default'
>(
    name: TName,
    config?: { mode?: TMode }
) => new SQLiteColumn<TName, 'BLOB', TMode, false, false, false, never, never>(name, 'BLOB', config as any)

export const boolean = <TName extends string>(
    name: TName
) => new SQLiteColumn<TName, 'BOOLEAN', 'default', false, false, false, never, never>(name, 'BOOLEAN')

export const numeric = <
    TName extends string,
    TMode extends 'bigint' | 'default' = 'default'
>(
    name: TName,
    config?: { mode?: TMode }
) => new SQLiteColumn<TName, 'NUMERIC', TMode, false, false, false, never, never>(name, 'NUMERIC', config as any)

export const enumType = <TName extends string, TValues extends readonly [string, ...string[]]>(
    name: TName,
    values: TValues
) => text(name, { enum: values })
