import { SqliteQueryCompiler } from 'kysely'

/**
 * SQLite query compiler that uses $1, $2, $3 placeholders instead of ?.
 * Required for @tauri-apps/plugin-sql which expects PostgreSQL-style placeholders
 * for SQLite (per sqlx convention).
 */
export class TauriQueryCompiler extends SqliteQueryCompiler {
    protected override getCurrentParameterPlaceholder(): string {
        return '$' + (this as any).numParameters
    }
}
