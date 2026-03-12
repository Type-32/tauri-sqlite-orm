import { Database as BunDatabase } from 'bun:sqlite'
import { DatabaseLike } from '../../src/dialect'
import { unlinkSync, existsSync } from 'node:fs'

/**
 * In-process SQLite database backed by bun:sqlite.
 * Satisfies DatabaseLike so it can be dropped into TauriDialect / TauriORM
 * without a running Tauri runtime.
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
        const stmt = this._db.prepare(query)
        return stmt.all(...params) as T
    }

    async execute(
        query: string,
        params: any[] = []
    ): Promise<{ lastInsertId: number; rowsAffected: number }> {
        const stmt = this._db.prepare(query)
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
