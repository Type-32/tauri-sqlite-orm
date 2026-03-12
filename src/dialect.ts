import {
    CompiledQuery,
    DatabaseConnection,
    DatabaseIntrospector,
    Dialect,
    DialectAdapter,
    Driver,
    Kysely,
    QueryCompiler,
    QueryResult,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
    TransactionSettings,
} from 'kysely'
import Database from '@tauri-apps/plugin-sql'

class TauriConnection implements DatabaseConnection {
    constructor(private readonly db: Database) {}

    async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
        const { sql, parameters } = compiledQuery
        const params = parameters as any[]
        const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(sql.trimStart())

        if (isSelect) {
            const rows = await this.db.select<O[]>(sql, params)
            return { rows }
        } else {
            const result = await this.db.execute(sql, params)
            return {
                rows: [] as O[],
                insertId: BigInt(Math.round(result.lastInsertId ?? 0)),
                numAffectedRows: BigInt(result.rowsAffected ?? 0),
            }
        }
    }

    async *streamQuery<O>(_compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<O>> {
        throw new Error('Streaming queries are not supported by @tauri-apps/plugin-sql')
    }
}

class TauriDriver implements Driver {
    constructor(private readonly db: Database) {}

    async init(): Promise<void> {}

    async acquireConnection(): Promise<DatabaseConnection> {
        return new TauriConnection(this.db)
    }

    async beginTransaction(conn: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
        await conn.executeQuery(CompiledQuery.raw('BEGIN'))
    }

    async commitTransaction(conn: DatabaseConnection): Promise<void> {
        await conn.executeQuery(CompiledQuery.raw('COMMIT'))
    }

    async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
        await conn.executeQuery(CompiledQuery.raw('ROLLBACK'))
    }

    async releaseConnection(_conn: DatabaseConnection): Promise<void> {}

    async destroy(): Promise<void> {}
}

export class TauriDialect implements Dialect {
    constructor(private readonly db: Database) {}

    createAdapter(): DialectAdapter {
        return new SqliteAdapter()
    }

    createDriver(): Driver {
        return new TauriDriver(this.db)
    }

    createIntrospector(db: Kysely<any>): DatabaseIntrospector {
        return new SqliteIntrospector(db)
    }

    createQueryCompiler(): QueryCompiler {
        return new SqliteQueryCompiler()
    }
}
