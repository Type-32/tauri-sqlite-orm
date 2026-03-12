import { Expression, Kysely, sql as kyselySql, SqlBool } from 'kysely'
import { DatabaseLike, TauriDialect } from './dialect'
import {
    SelectQueryBuilder,
    InsertQueryBuilder,
    UpdateQueryBuilder,
    DeleteQueryBuilder,
    WithQueryBuilder,
    RelationsBuilder,
} from './builders'
import {
    AnySQLiteColumn,
    AnyTable,
    ColumnDataType,
    ColumnOptions,
    ColumnValueTypes,
    ExtractColumnType,
    Mode,
    RelationConfig,
} from './types'

// Column class
export class SQLiteColumn<
    TName extends string = string,
    TType extends ColumnDataType = ColumnDataType,
    TMode extends Mode = 'default',
    TNotNull extends boolean = false,
    THasDefault extends boolean = false,
    TAutoincrement extends boolean = false,
    TEnum extends readonly string[] = never,
    TCustomType = never
> {
    _: {
        name: TName
        dataType: TType
        mode: TMode
        notNull: TNotNull
        hasDefault: THasDefault
        autoincrement: TAutoincrement
        enum: TEnum
        customType: TCustomType
    }

    constructor(
        name: TName,
        public type: TType,
        public options: ColumnOptions<ColumnValueTypes<TType, TMode>, TEnum> = {}
    ) {
        this._ = {
            name,
            dataType: type,
            mode: (options.mode || 'default') as TMode,
            notNull: (options.notNull ?? false) as TNotNull,
            hasDefault: (options.default !== undefined || options.$defaultFn !== undefined) as THasDefault,
            autoincrement: (options.autoincrement ?? false) as TAutoincrement,
            enum: options.enum as TEnum,
            customType: undefined as TCustomType,
        }
    }

    notNull(): SQLiteColumn<TName, TType, TMode, true, THasDefault, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, notNull: true, mode: this._.mode })
    }

    default(
        value: ColumnValueTypes<TType, TMode>
    ): SQLiteColumn<TName, TType, TMode, TNotNull, true, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, default: value, mode: this._.mode })
    }

    $defaultFn(
        fn: () => ColumnValueTypes<TType, TMode>
    ): SQLiteColumn<TName, TType, TMode, TNotNull, true, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, $defaultFn: fn, mode: this._.mode })
    }

    primaryKey(): SQLiteColumn<TName, TType, TMode, true, THasDefault, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(
            this._.name,
            this.type,
            { ...this.options, primaryKey: true, notNull: true, mode: this._.mode }
        )
    }

    autoincrement(): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, true, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, autoincrement: true, mode: this._.mode })
    }

    unique(): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, unique: true, mode: this._.mode })
    }

    /** Lazy reference (Drizzle-style) - use getter to allow self-refs and forward refs */
    references(
        getRef: () => AnySQLiteColumn,
        options?: { onDelete?: 'cascade' | 'set null' | 'set default' | 'restrict' | 'no action'; onUpdate?: 'cascade' | 'set null' | 'set default' | 'restrict' | 'no action' }
    ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(
            this._.name,
            this.type,
            {
                ...this.options,
                references: {
                    getRef: () => {
                        const column = getRef()
                        const table = (column as any).__table
                        if (!table) throw new Error(`Column ${(column as any)._?.name} has no __table - ensure it belongs to a table created with sqliteTable()`)
                        return { table, column }
                    },
                    onDelete: options?.onDelete,
                    onUpdate: options?.onUpdate,
                },
                mode: this._.mode
            }
        )
    }

    $onUpdateFn(
        fn: () => ColumnValueTypes<TType, TMode>
    ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, TCustomType> {
        return new SQLiteColumn(this._.name, this.type, { ...this.options, $onUpdateFn: fn, mode: this._.mode })
    }

    $type<T>(): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, T> {
        return this as any
    }

    as(alias: string): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, TCustomType> {
        // This is a placeholder for alias functionality
        return this
    }
}

type IsOptionalOnInsert<C extends AnySQLiteColumn> = C['_']['notNull'] extends false
    ? true
    : C['_']['hasDefault'] extends true
    ? true
    : C['_']['autoincrement'] extends true
    ? true
    : false

type OptionalColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
    [K in keyof TColumns]: IsOptionalOnInsert<TColumns[K]> extends true ? K : never
}[keyof TColumns]

type RequiredColumns<TColumns extends Record<string, AnySQLiteColumn>> = {
    [K in keyof TColumns]: IsOptionalOnInsert<TColumns[K]> extends true ? never : K
}[keyof TColumns]

// Extract column type for INSERT - respect notNull even when optional
type ExtractInsertColumnType<T extends AnySQLiteColumn> = 
    T extends SQLiteColumn<infer _, infer TType, infer TMode, infer TNotNull, infer THasDefault, infer TAutoincrement, infer TEnum, infer TCustomType>
        ? // First check if custom type is set (from $type<T>())
          [TCustomType] extends [never]
            ? // No custom type, check if it's an enum
              [TEnum] extends [never]
                ? // Not an enum, use ColumnValueTypes
                  TNotNull extends true
                    ? ColumnValueTypes<TType, TMode> // Non-nullable
                    : ColumnValueTypes<TType, TMode> | null // Nullable
                : // Enum type
                  TNotNull extends true
                    ? TEnum[number]
                    : TEnum[number] | null
            : // Custom type is set
              TNotNull extends true
                ? TCustomType
                : TCustomType | null
        : never

export type InferInsertModel<T extends AnyTable> = {
    [K in RequiredColumns<T['_']['columns']>]: ExtractInsertColumnType<T['_']['columns'][K]>
} & {
    [K in OptionalColumns<T['_']['columns']>]?: ExtractInsertColumnType<T['_']['columns'][K]>
}

export class Table<TColumns extends Record<string, AnySQLiteColumn>, TTableName extends string> {
    _: {
        name: TTableName
        columns: TColumns
    }
    relations: Record<string, RelationConfig> = {}

    constructor(name: TTableName, columns: TColumns) {
        this._ = {
            name,
            columns,
        }
    }
}

export const sqliteTable = <TTableName extends string, TColumns extends Record<string, AnySQLiteColumn>>(
    tableName: TTableName,
    columns: TColumns
): Table<TColumns, TTableName> => {
    const table = new Table(tableName, columns)
    // Attach table to columns so references(() => table.column) can resolve table name
    for (const col of Object.values(columns)) {
        (col as any).__table = table
    }
    // Expose columns as table.id, table.columnName (Drizzle-style) for references(() => paper.id)
    for (const key of Object.keys(columns)) {
        Object.defineProperty(table, key, {
            get: () => table._.columns[key as keyof TColumns],
            enumerable: true,
        })
    }
    return table
}

// Kysely-based type aliases — kept for API surface compatibility
export type SQLCondition = Expression<SqlBool>
export type SQLAggregate<T = number> = Expression<T>
export type SQLSubquery = Expression<any>

export const asc = (column: AnySQLiteColumn): Expression<any> =>
    kyselySql`${kyselySql.ref(column._.name)} ASC`

export const desc = (column: AnySQLiteColumn): Expression<any> =>
    kyselySql`${kyselySql.ref(column._.name)} DESC`

// Main ORM Class
export class TauriORM {
    private tables: Map<string, AnyTable> = new Map()
    private kysely: Kysely<any>

    constructor(
        private db: DatabaseLike,
        schema: Record<string, AnyTable | Record<string, Relation>> | undefined = undefined
    ) {
        this.kysely = new Kysely({ dialect: new TauriDialect(db) })

        if (schema) {
            for (const [, value] of Object.entries(schema)) {
                if (value instanceof Table) {
                    this.tables.set(value._.name, value)
                }
            }
        }
    }

    private buildColumnDefinition(col: AnySQLiteColumn, forAlterTable: boolean = false): string {
        let sql = `${col._.name} ${col.type}`
        if (col.options.primaryKey && !forAlterTable) {
            sql += ' PRIMARY KEY'
            if (col._.autoincrement) {
                sql += ' AUTOINCREMENT'
            }
        }
        if (col._.notNull) sql += ' NOT NULL'
        if (col.options.unique) sql += ' UNIQUE'
        if (col.options.default !== undefined) {
            const value = col.options.default
            sql += ` DEFAULT ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value}`
        }
        if (col.options.references) {
            const ref = 'getRef' in col.options.references ? col.options.references.getRef() : col.options.references
            sql += ` REFERENCES ${ref.table._.name}(${ref.column._.name})`
            const opts = col.options.references
            if (opts.onDelete) sql += ` ON DELETE ${opts.onDelete.toUpperCase()}`
            if (opts.onUpdate) sql += ` ON UPDATE ${opts.onUpdate.toUpperCase()}`
        }
        return sql
    }

    async checkMigration(): Promise<{
        safe: boolean
        changes: {
            tablesToCreate: string[]
            tablesToRecreate: string[]
            tablesToDrop: string[]
            columnsToAdd: Array<{ table: string; column: string }>
        }
    }> {
        const dbTables = await this.db.select<{ name: string }[]>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        const dbTableNames = new Set(dbTables.map((t) => t.name))
        const schemaTableNames = new Set(Array.from(this.tables.keys()))

        const changes = {
            tablesToCreate: [] as string[],
            tablesToRecreate: [] as string[],
            tablesToDrop: [] as string[],
            columnsToAdd: [] as Array<{ table: string; column: string }>,
        }

        // Check tables to create
        for (const tableName of schemaTableNames) {
            if (!dbTableNames.has(tableName)) {
                changes.tablesToCreate.push(tableName)
            }
        }

        // Check tables to drop
        for (const tableName of dbTableNames) {
            if (!schemaTableNames.has(tableName)) {
                changes.tablesToDrop.push(tableName)
            }
        }

        // Check for table recreation and column additions
        for (const table of this.tables.values()) {
            const tableName = table._.name
            if (!dbTableNames.has(tableName)) continue

            const existingTableInfo = await this.db.select<Array<{
                name: string
                type: string
                notnull: number
                dflt_value: any
                pk: number
            }>>(`PRAGMA table_info('${tableName}')`)

            const existingIndexes = await this.db.select<Array<{
                name: string
                unique: number
                origin: string
            }>>(`PRAGMA index_list('${tableName}')`)

            const uniqueColumns = new Set<string>()
            for (const index of existingIndexes) {
                if (index.unique === 1 && index.origin === 'u') {
                    const indexInfo = await this.db.select<Array<{ name: string }>>(`PRAGMA index_info('${index.name}')`)
                    if (indexInfo.length === 1) {
                        uniqueColumns.add(indexInfo[0].name)
                    }
                }
            }

            const existingColumns = new Map(existingTableInfo.map(c => [c.name, c]))
            const schemaColumns = table._.columns

            let needsRecreate = false

            for (const [colName, column] of Object.entries(schemaColumns)) {
                const dbColName = column._.name
                const existing = existingColumns.get(dbColName)

                if (!existing) {
                    if (!this.canAddColumnWithAlter(column)) {
                        needsRecreate = true
                        break
                    }
                    changes.columnsToAdd.push({ table: tableName, column: dbColName })
                } else {
                    const hasUniqueInDB = uniqueColumns.has(dbColName)
                    const wantsUnique = !!column.options.unique

                    if (hasUniqueInDB !== wantsUnique || this.hasColumnDefinitionChanged(column, existing)) {
                        needsRecreate = true
                        break
                    }
                }
            }

            // Check for removed columns (existingCol is DB name)
            for (const existingCol of existingColumns.keys()) {
                const schemaHasCol = Object.values(schemaColumns).some((c) => c._.name === existingCol)
                if (!schemaHasCol) {
                    needsRecreate = true
                    break
                }
            }

            if (needsRecreate) {
                changes.tablesToRecreate.push(tableName)
            }
        }

        const safe = changes.tablesToRecreate.length === 0 && changes.tablesToDrop.length === 0

        return { safe, changes }
    }

    async migrate(options?: { 
        performDestructiveActions?: boolean
        dryRun?: boolean
    }): Promise<void> {
        if (options?.dryRun) {
            const check = await this.checkMigration()
            console.log('[Tauri-ORM] Migration Preview (Dry Run):')
            console.log('  Tables to create:', check.changes.tablesToCreate)
            console.log('  Tables to recreate (DESTRUCTIVE):', check.changes.tablesToRecreate)
            console.log('  Tables to drop:', check.changes.tablesToDrop)
            console.log('  Columns to add:', check.changes.columnsToAdd)
            console.log('  Safe migration:', check.safe)
            return
        }
        const dbTables = await this.db.select<{ name: string }[]>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        const dbTableNames = new Set(dbTables.map((t) => t.name))
        const schemaTableNames = new Set(Array.from(this.tables.keys()))

        // Create/update tables
        for (const table of this.tables.values()) {
            const tableName = table._.name
            const tableExists = dbTableNames.has(tableName)

            if (!tableExists) {
                // Table does not exist, create it
                const columnsSql = Object.values(table._.columns)
                    .map((col) => this.buildColumnDefinition(col))
                    .join(', ')
                const createSql = `CREATE TABLE ${tableName} (${columnsSql})`
                await this.db.execute(createSql)
            } else {
                // Table exists, check for schema changes
                const existingTableInfo = await this.db.select<Array<{
                    name: string
                    type: string
                    notnull: number
                    dflt_value: any
                    pk: number
                }>>(`PRAGMA table_info('${tableName}')`)
                
                // Get existing UNIQUE constraints from indexes
                const existingIndexes = await this.db.select<Array<{
                    name: string
                    unique: number
                    origin: string
                }>>(`PRAGMA index_list('${tableName}')`)
                
                const uniqueColumns = new Set<string>()
                for (const index of existingIndexes) {
                    if (index.unique === 1 && index.origin === 'u') {
                        const indexInfo = await this.db.select<Array<{ name: string }>>(`PRAGMA index_info('${index.name}')`)
                        if (indexInfo.length === 1) {
                            uniqueColumns.add(indexInfo[0].name)
                        }
                    }
                }
                
                const existingColumns = new Map(existingTableInfo.map(c => [c.name, c]))
                const schemaColumns = table._.columns
                
                // Check if we need to recreate the table (column definition changes)
                let needsRecreate = false
                const columnsToAdd: AnySQLiteColumn[] = []
                
                for (const [colName, column] of Object.entries(schemaColumns)) {
                    const dbColName = column._.name
                    const existing = existingColumns.get(dbColName)
                    
                    if (!existing) {
                        // New column - check if it can be added with ALTER TABLE
                        if (this.canAddColumnWithAlter(column)) {
                            columnsToAdd.push(column)
                        } else {
                            needsRecreate = true
                            break
                        }
                    } else {
                        // Existing column - check if definition changed
                        const hasUniqueInDB = uniqueColumns.has(dbColName)
                        const wantsUnique = !!column.options.unique
                        
                        if (hasUniqueInDB !== wantsUnique) {
                            needsRecreate = true
                            break
                        }
                        
                        if (this.hasColumnDefinitionChanged(column, existing)) {
                            needsRecreate = true
                            break
                        }
                    }
                }
                
                // Check for removed columns (existingCol is DB name)
                if (options?.performDestructiveActions) {
                    for (const existingCol of existingColumns.keys()) {
                        const schemaHasCol = Object.values(schemaColumns).some((c) => c._.name === existingCol)
                        if (!schemaHasCol) {
                            needsRecreate = true
                            break
                        }
                    }
                }
                
                if (needsRecreate) {
                    // Recreate table with new schema
                    await this.recreateTable(tableName, table)
                } else if (columnsToAdd.length > 0) {
                    // Just add new columns with ALTER TABLE
                    for (const column of columnsToAdd) {
                        const columnSql = this.buildColumnDefinition(column, true)
                        await this.db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`)
                    }
                }
            }
        }

        // Drop extra tables if destructive actions are enabled
        if (options?.performDestructiveActions) {
            for (const tableName of dbTableNames) {
                if (!schemaTableNames.has(tableName)) {
                    await this.dropTable(tableName)
                }
            }
        }
    }
    
    private canAddColumnWithAlter(column: AnySQLiteColumn): boolean {
        // SQLite ALTER TABLE ADD COLUMN has limitations:
        // - Cannot add PRIMARY KEY
        // - Cannot add UNIQUE (without using a workaround)
        // - Can add NOT NULL only if column has a DEFAULT value
        if (column.options.primaryKey) return false
        if (column.options.unique) return false
        if (column._.notNull && column.options.default === undefined && !column.options.$defaultFn) return false
        return true
    }
    
    private hasColumnDefinitionChanged(column: AnySQLiteColumn, existing: {
        name: string
        type: string
        notnull: number
        dflt_value: any
        pk: number
    }): boolean {
        // Check if column type changed (normalize to uppercase)
        if (column.type.toUpperCase() !== existing.type.toUpperCase()) return true
        
        // Check if NOT NULL changed
        if (column._.notNull !== (existing.notnull === 1)) return true
        
        // Check if PRIMARY KEY changed
        if (!!column.options.primaryKey !== (existing.pk === 1)) return true
        
        // Check if default value changed
        const hasDefault = column.options.default !== undefined
        const existingHasDefault = existing.dflt_value !== null
        if (hasDefault !== existingHasDefault) return true
        
        // Check UNIQUE constraint (requires checking indexes)
        // For now, we'll check UNIQUE separately if needed
        
        return false
    }
    
    private async recreateTable(tableName: string, table: AnyTable): Promise<void> {
        const tempTableName = `${tableName}_new_${Date.now()}`
        
        // Create new table with updated schema
        const columnsSql = Object.values(table._.columns)
            .map((col) => this.buildColumnDefinition(col))
            .join(', ')
        await this.db.execute(`CREATE TABLE ${tempTableName} (${columnsSql})`)
        
        // Copy data from old table (only columns that exist in both)
        const oldColumns = await this.db.select<Array<{ name: string }>>(`PRAGMA table_info('${tableName}')`)
        const oldColumnNames = oldColumns.map(c => c.name)
        const newColumnNames = Object.values(table._.columns).map(c => c._.name)
        const commonColumns = oldColumnNames.filter(name => newColumnNames.includes(name))
        
        if (commonColumns.length > 0) {
            const columnsList = commonColumns.join(', ')
            await this.db.execute(
                `INSERT INTO ${tempTableName} (${columnsList}) SELECT ${columnsList} FROM ${tableName}`
            )
        }
        
        // Drop old table and rename new table
        await this.db.execute(`DROP TABLE ${tableName}`)
        await this.db.execute(`ALTER TABLE ${tempTableName} RENAME TO ${tableName}`)
    }

    select<T extends AnyTable, C extends (keyof T['_']['columns'])[] | undefined = undefined>(
        table: T,
        columns?: C
    ): SelectQueryBuilder<T, C> {
        const internalTable = this.tables.get(table._.name)
        if (!internalTable) {
            console.warn(
                `[Tauri-ORM] Table "${table._.name}" was not passed in the schema to the ORM constructor. Relations will not be available.`
            )
            return new SelectQueryBuilder(this.kysely, table, columns)
        }
        return new SelectQueryBuilder(this.kysely, internalTable as T, columns)
    }

    insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
        return new InsertQueryBuilder(this.kysely, table)
    }

    update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
        return new UpdateQueryBuilder(this.kysely, table)
    }

    delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
        return new DeleteQueryBuilder(this.kysely, table)
    }

    async upsert<T extends AnyTable>(
        table: T,
        data: InferInsertModel<T>,
        conflictTarget: (keyof T['_']['columns'])[]
    ): Promise<T extends AnyTable ? { lastInsertId: number; rowsAffected: number }[] : never> {
        const columns = conflictTarget.map(col => table._.columns[col as string])
        
        return this.insert(table)
            .values(data)
            .onConflictDoUpdate({
                target: columns.length === 1 ? columns[0] : columns,
                set: data
            })
            .execute() as any
    }

    $with(alias: string): {
        as: (query: SelectQueryBuilder<any, any>) => WithQueryBuilder
    } {
        const withBuilder = new WithQueryBuilder(this.kysely)
        return {
            as: (query: SelectQueryBuilder<any, any>) => {
                withBuilder.with(alias, query)
                return withBuilder
            },
        }
    }

    async transaction<T>(callback: (tx: TauriORM) => Promise<T>): Promise<T> {
        await this.db.execute('BEGIN')
        try {
            const result = await callback(this)
            await this.db.execute('COMMIT')
            return result
        } catch (e) {
            await this.db.execute('ROLLBACK')
            throw e
        }
    }

    rollback(): never {
        throw new Error('Transaction rolled back')
    }

    // --- Schema detection / signature ---
    private async ensureSchemaMeta(): Promise<void> {
        await this.db.execute(
            `CREATE TABLE IF NOT EXISTS _schema_meta
             (
                 key
                 TEXT
                 PRIMARY
                 KEY,
                 value
                 TEXT
                 NOT
                 NULL
             )`
        )
    }

    private async getSchemaMeta(key: string): Promise<string | null> {
        await this.ensureSchemaMeta()
        const rows = await this.db.select<any[]>(
            `SELECT value
             FROM _schema_meta
             WHERE key = ?`,
            [key]
        )
        return rows?.[0]?.value ?? null
    }

    private async setSchemaMeta(key: string, value: string): Promise<void> {
        await this.ensureSchemaMeta()
        await this.db.execute(
            `INSERT INTO _schema_meta(key, value)
             VALUES (?, ?) ON CONFLICT(key) DO
             UPDATE
             SET value = excluded.value`,
            [key, value]
        )
    }

    private normalizeColumn(col: AnySQLiteColumn): any {
        return {
            name: col._.name,
            type: col.type,
            pk: !!col.options.primaryKey,
            ai: !!col._.autoincrement,
            nn: !!col._.notNull,
            unique: !!col.options.unique,
            dv:
                col.options.default && typeof col.options.default === 'object' && (col.options.default as any).raw
                    ? { raw: (col.options.default as any).raw }
                    : col.options.default ?? null,
            hasDefaultFn: col.options.$defaultFn !== undefined,
            hasOnUpdateFn: col.options.$onUpdateFn !== undefined,
            onDelete: col.options.references?.onDelete ?? null,
            onUpdate: col.options.references?.onUpdate ?? null,
        }
    }

    private computeModelSignature(): string {
        const entries = Array.from(this.tables.values()).map((tbl) => {
            const cols = Object.values(tbl._.columns)
                .map((c) => this.normalizeColumn(c))
                .sort((a, b) => a.name.localeCompare(b.name))
            return { table: tbl._.name, columns: cols }
        })
        entries.sort((a, b) => a.table.localeCompare(b.table))
        return JSON.stringify(entries)
    }

    getSchemaSignature(): string {
        return this.computeModelSignature()
    }

    async isSchemaDirty(): Promise<{
        dirty: boolean
        current: string
        stored: string | null
    }> {
        const sig = this.computeModelSignature()
        const stored = await this.getSchemaMeta('schema_signature')
        return { dirty: sig !== stored, current: sig, stored }
    }

    async migrateIfDirty(): Promise<boolean> {
        const status = await this.isSchemaDirty()
        if (status.dirty) {
            await this.migrate()
            await this.setSchemaMeta('schema_signature', this.computeModelSignature())
            return true
        }
        return false
    }

    async doesTableExist(tableName: string): Promise<boolean> {
        const result = await this.db.select<{ name: string }[]>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [tableName]
        )
        return result.length > 0
    }

    async dropTable(tableName: string): Promise<void> {
        await this.db.execute(`DROP TABLE IF EXISTS ${tableName}`)
    }

    async doesColumnExist(tableName: string, columnName: string): Promise<boolean> {
        const result = await this.db.select<{ name: string }[]>(`PRAGMA table_info('${tableName}')`)
        return result.some((col) => col.name === columnName)
    }

    async renameTable(from: string, to: string): Promise<void> {
        await this.db.execute(`ALTER TABLE ${from} RENAME TO ${to}`)
    }

    async dropColumn(tableName: string, columnName: string): Promise<void> {
        await this.db.execute(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
    }

    async renameColumn(tableName: string, from: string, to: string): Promise<void> {
        await this.db.execute(`ALTER TABLE ${tableName} RENAME COLUMN ${from} TO ${to}`)
    }
}

// Relations
export class Relation<T extends AnyTable = AnyTable> {
    constructor(public foreignTable: T) {}
}

export class OneRelation<T extends AnyTable = AnyTable> extends Relation<T> {
    constructor(
        foreignTable: T,
        public config?: {
            fields: AnySQLiteColumn[]
            references: AnySQLiteColumn[]
            optional?: boolean
            alias?: string
        }
    ) {
        super(foreignTable)
    }
}

export class ManyRelation<T extends AnyTable = AnyTable> extends Relation<T> {
    constructor(
        foreignTable: T,
        public config?: {
            from?: AnySQLiteColumn[]
            to?: AnySQLiteColumn[]
            through?: {
                junctionTable: AnyTable
                fromRef: { column: AnySQLiteColumn; junctionColumn: AnySQLiteColumn }
                toRef: { column: AnySQLiteColumn; junctionColumn: AnySQLiteColumn }
            }
            optional?: boolean
            alias?: string
            where?: (alias: string) => unknown
        }
    ) {
        super(foreignTable)
    }
}

type InferRelations<R extends Record<string, Relation>> = {
    [K in keyof R]: R[K] extends OneRelation<infer T>
        ? { type: 'one'; foreignTable: T; fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
        : R[K] extends ManyRelation<infer T>
        ? { type: 'many'; foreignTable: T }
        : never
}

export const relations = <T extends AnyTable, R extends Record<string, Relation>>(
    table: T,
    relationsCallback: (helpers: RelationsBuilder) => R
): R => {
    const builtRelations = relationsCallback({
        one: <U extends AnyTable>(
            foreignTable: U,
            config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[]; optional?: boolean; alias?: string }
        ) => {
            return new OneRelation(foreignTable, config)
        },
        many: <U extends AnyTable>(foreignTable: U) => {
            return new ManyRelation(foreignTable)
        },
    })

    for (const [name, relation] of Object.entries(builtRelations)) {
        if (relation instanceof OneRelation) {
            table.relations[name] = {
                type: 'one',
                foreignTable: relation.foreignTable,
                fields: relation.config?.fields,
                references: relation.config?.references,
                optional: relation.config?.optional,
                alias: relation.config?.alias,
            }
        } else if (relation instanceof ManyRelation) {
            table.relations[name] = {
                type: 'many',
                foreignTable: relation.foreignTable,
            }
        }
    }

    return builtRelations
}

// Helper functions
export const getTableColumns = <T extends AnyTable>(table: T) => {
    return table._.columns
}

export const alias = <T extends AnyTable>(table: T, alias: string): Table<T['_']['columns'], T['_']['name']> => {
    // This is a placeholder for alias functionality
    return table as any
}
