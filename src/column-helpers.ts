// Column helpers
import { SQLiteColumn } from './orm'
import { Mode } from './types'

export const text = <TName extends string, TEnum extends readonly string[]>(
    name: TName,
    config?: { mode?: 'json'; enum?: TEnum }
) => new SQLiteColumn<TName, 'TEXT', any, false, false, false, TEnum>(name, 'TEXT', config)

export const integer = <TName extends string>(name: TName, config?: { mode?: Mode }) =>
    new SQLiteColumn<TName, 'INTEGER'>(name, 'INTEGER', config)

export const real = <TName extends string>(name: TName) => new SQLiteColumn<TName, 'REAL'>(name, 'REAL')

export const blob = <TName extends string>(name: TName, config?: { mode: 'json' | 'bigint' }) =>
    new SQLiteColumn<TName, 'BLOB'>(name, 'BLOB', config)

export const boolean = <TName extends string>(name: TName) => new SQLiteColumn<TName, 'BOOLEAN'>(name, 'BOOLEAN')

export const numeric = <TName extends string>(name: TName, config?: { mode?: 'bigint' }) =>
    new SQLiteColumn<TName, 'NUMERIC'>(name, 'NUMERIC', config)

export const enumType = <TName extends string, TValues extends readonly [string, ...string[]]>(
    name: TName,
    values: TValues
) => text(name, { enum: values })
