import { Database as BunDatabase } from 'bun:sqlite'
import { DatabaseLike } from '../../src/dialect'
import { unlinkSync, existsSync } from 'node:fs'

/**
 * Converts $1, $2, $3 placeholders (Tauri/sqlx style) to ? (bun:sqlite style).
 * Params stay in order.
 */
function toQuestionMarks(sql: string): string {
    return sql.replace(/\$(\d+)/g, '?')
}

/**
 * In-process SQLite database backed by bun:sqlite.
 * Satisfies DatabaseLike so it can be dropped into TauriDialect / TauriORM
 * without a running Tauri runtime.
 * Converts $1,$2,$3 placeholders to ? for bun:sqlite compatibility.
 */
export class MockDatabase implements DatabaseLike {
    private readonly _db: BunDatabase

    constructor(path: string) {
        this._db = new BunDatabase(path, { create: true })
        this._db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
    }

    static open(path: string): MockDatabase {
        return new MockDatabase(path)
    }

    async select<T>(query: string, params: any[] = []): Promise<T> {
        const sql = toQuestionMarks(query)
        const stmt = this._db.prepare(sql)
        return stmt.all(...params) as T
    }

    async execute(
        query: string,
        params: any[] = []
    ): Promise<{ rowsAffected: number; lastInsertId?: number }> {
        const sql = toQuestionMarks(query)
        const stmt = this._db.prepare(sql)
        const result = stmt.run(...params)
        return {
            lastInsertId: Number(result.lastInsertRowid),
            rowsAffected: result.changes,
        }
    }

    close(): void {
        this._db.close()
    }
}

/** Delete a test database file if it exists. */
export function removeDb(path: string): void {
    for (const suffix of ['', '-wal', '-shm']) {
        const f = path + suffix
        if (existsSync(f)) unlinkSync(f)
    }
}
