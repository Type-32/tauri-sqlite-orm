// Column helpers
import { SQLiteColumn } from './orm'
import { Mode } from './types'

export const text = <TName extends string, TEnum extends readonly string[]>(
    name: TName,
    config?: { mode?: 'json'; enum?: TEnum }
) => new SQLiteColumn(name, 'TEXT', config, config?.mode)
export const integer = <TName extends string, TMode extends Mode = 'default'>(name: TName, config?: { mode?: TMode }) =>
    new SQLiteColumn(name, 'INTEGER', {}, config?.mode || 'default')
export const real = <TName extends string>(name: TName) => new SQLiteColumn(name, 'REAL')
export const blob = <TName extends string>(name: TName, config?: { mode: 'json' | 'bigint' }) =>
    new SQLiteColumn(name, 'BLOB', {}, config?.mode)
export const boolean = <TName extends string>(name: TName) => new SQLiteColumn(name, 'BOOLEAN')
export const numeric = <TName extends string>(name: TName, config?: { mode?: 'bigint' }) =>
    new SQLiteColumn(name, 'NUMERIC', {}, config?.mode)
export const enumType = <TName extends string, TValues extends readonly [string, ...string[]]>(
    name: TName,
    values: TValues
) => text(name, { enum: values })
