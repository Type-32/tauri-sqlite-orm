import Database from '@tauri-apps/plugin-sql'
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

    references<T extends AnyTable, K extends keyof T['_']['columns'] & string>(
        ref: T,
        column: K | T['_']['columns'][K]
    ): SQLiteColumn<TName, TType, TMode, TNotNull, THasDefault, TAutoincrement, TEnum, TCustomType> {
        // Accept either string key or column object for better DX
        const columnKey = typeof column === 'string' ? column : (column as any)._.name as K
        const columnObj = typeof column === 'string' ? ref._.columns[column] : column as any
        
        return new SQLiteColumn(
            this._.name,
            this.type,
            {
                ...this.options,
                references: {
                    table: ref,
                    column: columnObj,
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
    return new Table(tableName, columns)
}

// Query Helpers
export type SQLCondition = {
    sql: string
    params: any[]
}

// Aggregate type for use in SELECT clauses
export type SQLAggregate<T = number> = {
    sql: string
    params: any[]
    _type?: T // phantom type for type inference
}

// Subquery type
export type SQLSubquery = {
    sql: string
    params: any[]
    _isSubquery: true
}

export const asc = (column: AnySQLiteColumn) => ({
    sql: `${column._.name} ASC`,
    params: [],
})

export const desc = (column: AnySQLiteColumn) => ({
    sql: `${column._.name} DESC`,
    params: [],
})

// SQL template tag
export const sql = <T = unknown>(
    strings: TemplateStringsArray,
    ...values: any[]
): { sql: string; params: any[]; mapWith?: (value: any) => T } => {
    const queryParts: string[] = []
    const params: any[] = []

    strings.forEach((str, i) => {
        queryParts.push(str)
        if (values[i] !== undefined) {
            if (typeof values[i] === 'object' && values[i].sql) {
                queryParts.push(values[i].sql)
                params.push(...values[i].params)
            } else {
                queryParts.push('?')
                params.push(values[i])
            }
        }
    })

    return {
        sql: queryParts.join(''),
        params,
    }
}

// Main ORM Class
export class TauriORM {
    private tables: Map<string, AnyTable> = new Map()

    constructor(
        private db: Database,
        schema: Record<string, AnyTable | Record<string, Relation>> | undefined = undefined
    ) {
        if (schema) {
            // First pass: register all tables
            for (const [key, value] of Object.entries(schema)) {
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
            sql += ` REFERENCES ${col.options.references.table._.name}(${col.options.references.column._.name})`
        }
        return sql
    }

    async migrate(options?: { performDestructiveActions?: boolean }): Promise<void> {
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
                const createSql = `CREATE TABLE ${tableName}
                                   (
                                       ${columnsSql}
                                   )`
                await this.db.execute(createSql)
            } else {
                // Table exists, add or remove columns
                const existingTableInfo = await this.db.select<{ name: string }[]>(`PRAGMA table_info('${tableName}')`)
                const existingColumnNames = new Set(existingTableInfo.map((c) => c.name))
                const schemaColumnNames = new Set(Object.keys(table._.columns))

                // Add missing columns
                for (const column of Object.values(table._.columns)) {
                    if (!existingColumnNames.has(column._.name)) {
                        const columnSql = this.buildColumnDefinition(column, true)
                        const alterSql = `ALTER TABLE ${tableName}
                            ADD COLUMN ${columnSql}`
                        await this.db.execute(alterSql)
                    }
                }

                // Drop extra columns if destructive actions are enabled
                if (options?.performDestructiveActions) {
                    for (const colName of existingColumnNames) {
                        if (!schemaColumnNames.has(colName)) {
                            await this.dropColumn(tableName, colName)
                        }
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

    select<T extends AnyTable, C extends (keyof T['_']['columns'])[] | undefined = undefined>(
        table: T,
        columns?: C
    ): SelectQueryBuilder<T, C> {
        const internalTable = this.tables.get(table._.name)
        if (!internalTable) {
            console.warn(
                `[Tauri-ORM] Table "${table._.name}" was not passed in the schema to the ORM constructor. Relations will not be available.`
            )
            return new SelectQueryBuilder(this.db, table, columns)
        }
        return new SelectQueryBuilder(this.db, internalTable as T, columns)
    }

    insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
        return new InsertQueryBuilder(this.db, table)
    }

    update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
        return new UpdateQueryBuilder(this.db, table)
    }

    delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
        return new DeleteQueryBuilder(this.db, table)
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
        as: (query: { sql: string; params: any[] }) => WithQueryBuilder
    } {
        const withBuilder = new WithQueryBuilder(this.db)
        return {
            as: (query: { sql: string; params: any[] }) => {
                withBuilder.with(alias, query)
                return withBuilder
            },
        }
    }

    async transaction<T>(callback: (tx: TauriORM) => Promise<T>): Promise<T> {
        await this.db.execute('BEGIN TRANSACTION')
        try {
            const result = await callback(this)
            await this.db.execute('COMMIT')
            return result
        } catch (error) {
            await this.db.execute('ROLLBACK')
            throw error
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
    constructor(foreignTable: T, public config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }) {
        super(foreignTable)
    }
}

export class ManyRelation<T extends AnyTable = AnyTable> extends Relation<T> {
    constructor(foreignTable: T) {
        super(foreignTable)
    }
}

export class ManyToManyRelation<T extends AnyTable = AnyTable> extends Relation<T> {
    constructor(
        foreignTable: T,
        public config: {
            junctionTable: AnyTable
            junctionFields: AnySQLiteColumn[] // columns in junction that reference this table
            junctionReferences: AnySQLiteColumn[] // columns in junction that reference foreign table
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
        : R[K] extends ManyToManyRelation<infer T>
        ? {
              type: 'manyToMany'
              foreignTable: T
              junctionTable: AnyTable
              junctionFields: AnySQLiteColumn[]
              junctionReferences: AnySQLiteColumn[]
          }
        : never
}

export const relations = <T extends AnyTable, R extends Record<string, Relation>>(
    table: T,
    relationsCallback: (helpers: RelationsBuilder) => R
): R => {
    const builtRelations = relationsCallback({
        one: <U extends AnyTable>(
            foreignTable: U,
            config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
        ) => {
            return new OneRelation(foreignTable, config)
        },
        many: <U extends AnyTable>(foreignTable: U) => {
            return new ManyRelation(foreignTable)
        },
        manyToMany: <U extends AnyTable>(
            foreignTable: U,
            config: {
                junctionTable: AnyTable
                junctionFields: AnySQLiteColumn[]
                junctionReferences: AnySQLiteColumn[]
            }
        ) => {
            return new ManyToManyRelation(foreignTable, config)
        },
    })

    for (const [name, relation] of Object.entries(builtRelations)) {
        if (relation instanceof OneRelation) {
            table.relations[name] = {
                type: 'one',
                foreignTable: relation.foreignTable,
                fields: relation.config?.fields,
                references: relation.config?.references,
            }
        } else if (relation instanceof ManyRelation) {
            table.relations[name] = {
                type: 'many',
                foreignTable: relation.foreignTable,
            }
        } else if (relation instanceof ManyToManyRelation) {
            table.relations[name] = {
                type: 'manyToMany',
                foreignTable: relation.foreignTable,
                junctionTable: relation.config.junctionTable,
                junctionFields: relation.config.junctionFields,
                junctionReferences: relation.config.junctionReferences,
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
