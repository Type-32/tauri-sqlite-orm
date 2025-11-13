/**
 * Serialization and Deserialization utilities for SQLite type conversion
 */

import { AnySQLiteColumn } from './types'

/**
 * Serialize JavaScript value to SQLite-compatible format
 * Used for INSERT and UPDATE operations
 */
export function serializeValue(value: any, column: AnySQLiteColumn): any {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return null
    }

    const { dataType, mode } = column._

    // TEXT type
    if (dataType === 'TEXT') {
        if (mode === 'json') {
            return typeof value === 'string' ? value : JSON.stringify(value)
        }
        return String(value)
    }

    // INTEGER type
    if (dataType === 'INTEGER') {
        if (mode === 'timestamp' || mode === 'timestamp_ms') {
            // Convert Date to timestamp
            if (value instanceof Date) {
                return mode === 'timestamp_ms' ? value.getTime() : Math.floor(value.getTime() / 1000)
            }
            // If already a number, pass through
            return typeof value === 'number' ? value : parseInt(String(value), 10)
        }
        if (mode === 'boolean') {
            // Convert boolean to 0/1
            return value ? 1 : 0
        }
        // Regular integer
        return typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10)
    }

    // REAL type
    if (dataType === 'REAL') {
        return typeof value === 'number' ? value : parseFloat(String(value))
    }

    // BOOLEAN type
    if (dataType === 'BOOLEAN') {
        return value ? 1 : 0
    }

    // BLOB type
    if (dataType === 'BLOB') {
        if (mode === 'json') {
            return typeof value === 'string' ? value : JSON.stringify(value)
        }
        if (mode === 'bigint') {
            return String(value) // SQLite stores bigint as string
        }
        return value
    }

    // NUMERIC type
    if (dataType === 'NUMERIC') {
        if (mode === 'bigint') {
            return String(value) // SQLite stores bigint as string
        }
        return typeof value === 'number' ? value : parseFloat(String(value))
    }

    return value
}

/**
 * Deserialize SQLite value to proper TypeScript type
 * Used for SELECT operations
 */
export function deserializeValue(value: any, column: AnySQLiteColumn): any {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return null
    }

    const { dataType, mode } = column._

    // TEXT type
    if (dataType === 'TEXT') {
        if (mode === 'json') {
            try {
                return JSON.parse(value as string)
            } catch {
                return value
            }
        }
        return value // Already string
    }

    // INTEGER type
    if (dataType === 'INTEGER') {
        if (mode === 'timestamp' || mode === 'timestamp_ms') {
            // SQLite stores timestamps as numbers, convert to Date
            const num = typeof value === 'string' ? parseInt(value, 10) : value
            if (isNaN(num)) return null
            return mode === 'timestamp_ms' ? new Date(num) : new Date(num * 1000)
        }
        if (mode === 'boolean') {
            // SQLite stores booleans as 0/1
            return value === 1 || value === '1' || value === true
        }
        // Regular integer
        return typeof value === 'string' ? parseInt(value, 10) : value
    }

    // REAL type
    if (dataType === 'REAL') {
        return typeof value === 'string' ? parseFloat(value) : value
    }

    // BOOLEAN type
    if (dataType === 'BOOLEAN') {
        return value === 1 || value === '1' || value === true
    }

    // BLOB type
    if (dataType === 'BLOB') {
        if (mode === 'json') {
            try {
                return JSON.parse(value as string)
            } catch {
                return value
            }
        }
        if (mode === 'bigint') {
            return typeof value === 'string' ? BigInt(value) : BigInt(value)
        }
        // Assume Uint8Array or similar
        return value
    }

    // NUMERIC type
    if (dataType === 'NUMERIC') {
        if (mode === 'bigint') {
            return typeof value === 'string' ? BigInt(value) : BigInt(value)
        }
        return typeof value === 'string' ? parseFloat(value) : value
    }

    return value
}

