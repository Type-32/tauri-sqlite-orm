import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { sqliteTable, integer, text, boolean, TauriORM } from '../src/index'
import { MockDatabase, removeDb } from './helpers/mock-db'
import { createOrm, users, posts, tags, postTags, schema } from './helpers/schema'

const DB_PATH = 'schema-test.db'

// ─── Migration — create tables ────────────────────────────────────────────────

describe('migrate() — create tables from scratch', () => {
    let orm: TauriORM
    let db: MockDatabase

    beforeAll(async () => {
        removeDb(DB_PATH)
        ;({ orm, db } = createOrm(DB_PATH))
        await orm.migrate()
    })

    afterAll(() => {
        db.close()
        removeDb(DB_PATH)
    })

    test('creates all tables', async () => {
        for (const name of ['users', 'posts', 'tags', 'post_tags']) {
            expect(await orm.doesTableExist(name)).toBe(true)
        }
    })

    test('_schema_meta table is created on migrateIfDirty', async () => {
        await orm.migrateIfDirty()
        expect(await orm.doesTableExist('_schema_meta')).toBe(true)
    })

    test('doesTableExist returns false for unknown table', async () => {
        expect(await orm.doesTableExist('does_not_exist')).toBe(false)
    })

    test('doesColumnExist returns true for known column', async () => {
        expect(await orm.doesColumnExist('users', 'email')).toBe(true)
    })

    test('doesColumnExist returns false for unknown column', async () => {
        expect(await orm.doesColumnExist('users', 'nonexistent')).toBe(false)
    })
})

// ─── Migration — add column ───────────────────────────────────────────────────

describe('migrate() — add column to existing table', () => {
    const DB2 = 'schema-add-col-test.db'
    let db: MockDatabase

    beforeAll(() => removeDb(DB2))
    afterAll(() => { db?.close(); removeDb(DB2) })

    test('adds new nullable column without data loss', async () => {
        // Step 1: create schema WITHOUT bio column
        const v1 = sqliteTable('people', {
            id: integer('id').primaryKey().autoincrement(),
            name: text('name').notNull(),
        })
        db = MockDatabase.open(DB2)
        const orm1 = new TauriORM(db, { people: v1 })
        await orm1.migrate()
        await orm1.insert(v1).values({ name: 'Alice' }).execute()

        // Step 2: add bio column with default
        const v2 = sqliteTable('people', {
            id: integer('id').primaryKey().autoincrement(),
            name: text('name').notNull(),
            bio: text('bio').default(''),
        })
        const orm2 = new TauriORM(db, { people: v2 })
        await orm2.migrate()

        const rows = await orm2.select(v2).all()
        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Alice')
        expect(rows[0].bio).toBe('')
    })
})

// ─── checkMigration ───────────────────────────────────────────────────────────

describe('checkMigration() — diff preview', () => {
    const DB3 = 'schema-check-test.db'
    let db: MockDatabase

    beforeAll(() => removeDb(DB3))
    afterAll(() => { db?.close(); removeDb(DB3) })

    test('reports tables to create on empty database', async () => {
        db = MockDatabase.open(DB3)
        const orm = new TauriORM(db, schema)
        const { changes } = await orm.checkMigration()
        expect(changes.tablesToCreate).toContain('users')
        expect(changes.tablesToCreate).toContain('posts')
        expect(changes.tablesToCreate).toContain('tags')
    })

    test('reports no changes after migrate()', async () => {
        const orm = new TauriORM(db, schema)
        await orm.migrate()
        const { changes } = await orm.checkMigration()
        expect(changes.tablesToCreate).toHaveLength(0)
        expect(changes.tablesToRecreate).toHaveLength(0)
    })
})

// ─── isSchemaDirty / migrateIfDirty ──────────────────────────────────────────

describe('isSchemaDirty() and migrateIfDirty()', () => {
    const DB4 = 'schema-dirty-test.db'
    let db: MockDatabase

    beforeAll(() => removeDb(DB4))
    afterAll(() => { db?.close(); removeDb(DB4) })

    test('dirty on fresh database, clean after migrateIfDirty()', async () => {
        db = MockDatabase.open(DB4)
        const orm = new TauriORM(db, schema)

        const before = await orm.isSchemaDirty()
        expect(before.dirty).toBe(true)

        const migrated = await orm.migrateIfDirty()
        expect(migrated).toBe(true)

        const after = await orm.isSchemaDirty()
        expect(after.dirty).toBe(false)
    })

    test('references with onDelete cascade are emitted in migration', async () => {
        const cascadeTable = sqliteTable('_cascade_test', {
            id: integer('id').primaryKey().autoincrement(),
            refId: integer('ref_id')
                .references(users, users._.columns.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        })
        const ormCascade = new TauriORM(db, { ...schema, _cascade_test: cascadeTable })
        await ormCascade.migrate()
        const info = await db.select<any[]>(`PRAGMA table_info('_cascade_test')`)
        const refCol = info.find((c: any) => c.name === 'ref_id')
        expect(refCol).toBeDefined()
        // SQLite stores FK in sqlite_master; verify CREATE TABLE contains ON DELETE CASCADE
        const createSql = await db.select<any[]>(
            `SELECT sql FROM sqlite_master WHERE type='table' AND name='_cascade_test'`
        )
        expect((createSql[0]?.sql ?? '').toUpperCase()).toContain('ON DELETE CASCADE')
        expect((createSql[0]?.sql ?? '').toUpperCase()).toContain('ON UPDATE RESTRICT')
        await ormCascade.dropTable('_cascade_test')
    })

    test('migrateIfDirty() returns false when already in sync', async () => {
        const orm = new TauriORM(db, schema)
        expect(await orm.migrateIfDirty()).toBe(false)
    })
})

// ─── Column recreation ────────────────────────────────────────────────────────

describe('migrate() — recreate table when column definition changes', () => {
    const DB5 = 'schema-recreate-test.db'
    let db: MockDatabase

    beforeAll(() => removeDb(DB5))
    afterAll(() => { db?.close(); removeDb(DB5) })

    test('recreates table and preserves data for compatible columns', async () => {
        const v1 = sqliteTable('items', {
            id: integer('id').primaryKey().autoincrement(),
            label: text('label').notNull(),
        })
        db = MockDatabase.open(DB5)
        const orm1 = new TauriORM(db, { items: v1 })
        await orm1.migrate()
        await orm1.insert(v1).values({ label: 'first' }).execute()

        // Make label nullable — triggers table recreation
        const v2 = sqliteTable('items', {
            id: integer('id').primaryKey().autoincrement(),
            label: text('label'),
        })
        const orm2 = new TauriORM(db, { items: v2 })
        await orm2.migrate()

        const rows = await orm2.select(v2).all()
        expect(rows).toHaveLength(1)
        expect(rows[0].label).toBe('first')
    })
})
