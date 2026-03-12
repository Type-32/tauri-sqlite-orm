import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
    eq, ne, gt, gte, lt, lte,
    and, or, not,
    like, ilike, startsWith, endsWith, contains,
    isNull, isNotNull,
    inArray, notIn, between,
} from '../src/index'
import { MockDatabase, removeDb } from './helpers/mock-db'
import { createOrm, users, posts, postTags } from './helpers/schema'
import type { TauriORM } from '../src/index'

const DB_PATH = 'queries-test.db'

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

// Seed helpers
async function seedUsers() {
    // Delete in FK order: post_tags -> posts -> users
    await orm.delete(postTags).allowGlobalOperation().execute()
    await orm.delete(posts).allowGlobalOperation().execute()
    await orm.delete(users).allowGlobalOperation().execute()
    await orm.insert(users).values([
        { name: 'Alice', email: 'alice@example.com', age: 30, score: 9.5, isActive: true, role: 'admin' },
        { name: 'Bob',   email: 'bob@example.com',   age: 25, score: 7.0, isActive: true, role: 'user' },
        { name: 'Carol', email: 'carol@example.com', age: 35, score: 5.5, isActive: false, role: 'user' },
        { name: 'Dave',  email: 'dave@example.com',  age: 28, score: 8.0, isActive: true, role: 'guest' },
        { name: 'Eve',   email: 'eve@example.com',   age: 22, score: null as any, isActive: false, role: 'user' },
    ]).execute()
}

async function seedPosts() {
    await orm.delete(posts).allowGlobalOperation().execute()
    const [alice] = await orm.select(users).where(eq(users._.columns.email, 'alice@example.com')).all()
    const [bob]   = await orm.select(users).where(eq(users._.columns.email, 'bob@example.com')).all()
    await orm.insert(posts).values([
        { title: 'Hello World', content: 'First post', userId: alice.id, views: 100, published: true },
        { title: 'Bun is fast', content: 'Second post', userId: alice.id, views: 200, published: true },
        { title: 'Draft post',  content: 'Third post',  userId: bob.id,   views: 0,   published: false },
    ]).execute()
}

// ─── INSERT ───────────────────────────────────────────────────────────────────

describe('INSERT', () => {
    beforeEach(async () => {
        await orm.delete(users).allowGlobalOperation().execute()
    })

    test('single row insert returns lastInsertId', async () => {
        const [result] = await orm.insert(users)
            .values({ name: 'Test', email: 'test@example.com', isActive: true, role: 'user' })
            .execute()
        expect(result.lastInsertId).toBeGreaterThan(0)
    })

    test('batch insert multiple rows', async () => {
        await orm.insert(users).values([
            { name: 'A', email: 'a@test.com', isActive: true, role: 'user' },
            { name: 'B', email: 'b@test.com', isActive: false, role: 'guest' },
        ]).execute()
        const rows = await orm.select(users).all()
        expect(rows).toHaveLength(2)
    })

    test('returningFirst() returns the inserted row', async () => {
        const row = await orm.insert(users)
            .values({ name: 'Returning', email: 'ret@test.com', isActive: true, role: 'admin' })
            .returningFirst()
        expect(row).toBeDefined()
        expect(row!.name).toBe('Returning')
        expect(row!.email).toBe('ret@test.com')
    })

    test('returningAll() returns all inserted rows', async () => {
        const rows = await orm.insert(users)
            .values([
                { name: 'X', email: 'x@test.com', isActive: true, role: 'user' },
                { name: 'Y', email: 'y@test.com', isActive: true, role: 'user' },
            ])
            .returningAll()
        expect(rows).toHaveLength(2)
        expect(rows.map(r => r.name)).toEqual(['X', 'Y'])
    })

    test('$defaultFn is applied automatically', async () => {
        const row = await orm.insert(users)
            .values({ name: 'Def', email: 'def@test.com', isActive: true, role: 'user' })
            .returningFirst()
        expect(row!.createdAt).toBeInstanceOf(Date)
    })

    test('onConflictDoNothing skips duplicate', async () => {
        await orm.insert(users)
            .values({ name: 'Dup', email: 'dup@test.com', isActive: true, role: 'user' })
            .execute()
        await orm.insert(users)
            .values({ name: 'Dup2', email: 'dup@test.com', isActive: true, role: 'user' })
            .onConflictDoNothing()
            .execute()
        const rows = await orm.select(users)
            .where(eq(users._.columns.email, 'dup@test.com'))
            .all()
        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Dup')
    })

    test('onConflictDoUpdate updates on conflict', async () => {
        await orm.insert(users)
            .values({ name: 'Orig', email: 'upsert@test.com', isActive: true, role: 'user' })
            .execute()
        await orm.insert(users)
            .values({ name: 'Updated', email: 'upsert@test.com', isActive: true, role: 'admin' })
            .onConflictDoUpdate({ target: users._.columns.email, set: { name: 'Updated', role: 'admin' } })
            .execute()
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'upsert@test.com'))
            .get()
        expect(row!.name).toBe('Updated')
        expect(row!.role).toBe('admin')
    })

    test('toSQL() generates correct INSERT statement', () => {
        const { sql, params } = orm.insert(users)
            .values({ name: 'SQL', email: 'sql@test.com', isActive: true, role: 'user' })
            .toSQL()
        expect(sql).toContain('insert into')
        expect(sql).toContain('users')
        expect(params).toContain('sql@test.com')
    })
})

// ─── SELECT ───────────────────────────────────────────────────────────────────

describe('SELECT — basic', () => {
    beforeAll(seedUsers)

    test('.all() returns all rows', async () => {
        const rows = await orm.select(users).all()
        expect(rows).toHaveLength(5)
    })

    test('.get() returns first matching row', async () => {
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .get()
        expect(row?.name).toBe('Alice')
    })

    test('.first() is alias for .get()', async () => {
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'bob@example.com'))
            .first()
        expect(row?.name).toBe('Bob')
    })

    test('SELECT specific columns', async () => {
        const rows = await orm.select(users, ['id', 'name']).all()
        expect(rows[0]).toHaveProperty('id')
        expect(rows[0]).toHaveProperty('name')
    })

    test('ORDER BY ASC', async () => {
        const rows = await orm.select(users).orderBy(users._.columns.age, 'asc').all()
        const ages = rows.map(r => r.age).filter(a => a !== null) as number[]
        expect(ages).toEqual([...ages].sort((a, b) => a - b))
    })

    test('ORDER BY DESC', async () => {
        const rows = await orm.select(users).orderBy(users._.columns.age, 'desc').all()
        const ages = rows.map(r => r.age).filter(a => a !== null) as number[]
        expect(ages).toEqual([...ages].sort((a, b) => b - a))
    })

    test('LIMIT', async () => {
        const rows = await orm.select(users).limit(2).all()
        expect(rows).toHaveLength(2)
    })

    test('OFFSET', async () => {
        const all = await orm.select(users).orderBy(users._.columns.id, 'asc').all()
        const paged = await orm.select(users).orderBy(users._.columns.id, 'asc').limit(2).offset(2).all()
        expect(paged[0].id).toBe(all[2].id)
    })

    test('DISTINCT', async () => {
        const roles = await orm.select(users, ['role']).distinct().all()
        const roleValues = roles.map(r => r.role)
        expect(new Set(roleValues).size).toBe(roleValues.length)
    })
})

// ─── SELECT — operators ───────────────────────────────────────────────────────

describe('SELECT — WHERE operators', () => {
    beforeAll(seedUsers)

    test('eq', async () => {
        const rows = await orm.select(users).where(eq(users._.columns.name, 'Alice')).all()
        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Alice')
    })

    test('ne', async () => {
        const rows = await orm.select(users).where(ne(users._.columns.role, 'admin')).all()
        expect(rows.every(r => r.role !== 'admin')).toBe(true)
    })

    test('gt', async () => {
        const rows = await orm.select(users).where(gt(users._.columns.age, 28)).all()
        expect(rows.every(r => r.age! > 28)).toBe(true)
    })

    test('gte', async () => {
        const rows = await orm.select(users).where(gte(users._.columns.age, 30)).all()
        expect(rows.every(r => r.age! >= 30)).toBe(true)
    })

    test('lt', async () => {
        const rows = await orm.select(users).where(lt(users._.columns.age, 28)).all()
        expect(rows.every(r => r.age! < 28)).toBe(true)
    })

    test('lte', async () => {
        const rows = await orm.select(users).where(lte(users._.columns.age, 25)).all()
        expect(rows.every(r => r.age! <= 25)).toBe(true)
    })

    test('and', async () => {
        const rows = await orm.select(users)
            .where(and(
                eq(users._.columns.isActive, true),
                gt(users._.columns.age, 25)
            ))
            .all()
        expect(rows.every(r => r.isActive && r.age! > 25)).toBe(true)
    })

    test('or', async () => {
        const rows = await orm.select(users)
            .where(or(
                eq(users._.columns.role, 'admin'),
                eq(users._.columns.role, 'guest')
            ))
            .all()
        expect(rows.every(r => r.role === 'admin' || r.role === 'guest')).toBe(true)
    })

    test('not', async () => {
        const rows = await orm.select(users)
            .where(not(eq(users._.columns.isActive, true)))
            .all()
        expect(rows.every(r => !r.isActive)).toBe(true)
    })

    test('like', async () => {
        const rows = await orm.select(users).where(like(users._.columns.email, '%@example.com')).all()
        expect(rows.length).toBeGreaterThan(0)
        expect(rows.every(r => r.email.endsWith('@example.com'))).toBe(true)
    })

    test('ilike (case-insensitive)', async () => {
        const rows = await orm.select(users).where(ilike(users._.columns.name, 'alice')).all()
        expect(rows).toHaveLength(1)
    })

    test('startsWith', async () => {
        const rows = await orm.select(users).where(startsWith(users._.columns.name, 'A')).all()
        expect(rows.every(r => r.name.startsWith('A'))).toBe(true)
    })

    test('endsWith', async () => {
        const rows = await orm.select(users).where(endsWith(users._.columns.name, 'e')).all()
        expect(rows.every(r => r.name.endsWith('e'))).toBe(true)
    })

    test('contains', async () => {
        const rows = await orm.select(users).where(contains(users._.columns.email, 'alice')).all()
        expect(rows.every(r => r.email.includes('alice'))).toBe(true)
    })

    test('isNull', async () => {
        const rows = await orm.select(users).where(isNull(users._.columns.score)).all()
        expect(rows.every(r => r.score === null)).toBe(true)
    })

    test('isNotNull', async () => {
        const rows = await orm.select(users).where(isNotNull(users._.columns.score)).all()
        expect(rows.every(r => r.score !== null)).toBe(true)
    })

    test('inArray', async () => {
        const rows = await orm.select(users)
            .where(inArray(users._.columns.role, ['admin', 'guest']))
            .all()
        expect(rows.every(r => r.role === 'admin' || r.role === 'guest')).toBe(true)
    })

    test('notIn', async () => {
        const rows = await orm.select(users)
            .where(notIn(users._.columns.role, ['admin', 'guest']))
            .all()
        expect(rows.every(r => r.role !== 'admin' && r.role !== 'guest')).toBe(true)
    })

    test('between', async () => {
        const rows = await orm.select(users)
            .where(between(users._.columns.age, 25, 30))
            .all()
        expect(rows.every(r => r.age! >= 25 && r.age! <= 30)).toBe(true)
    })
})

// ─── SELECT — type deserialization ───────────────────────────────────────────

describe('SELECT — type deserialization', () => {
    beforeAll(seedUsers)

    test('boolean columns are deserialized as booleans', async () => {
        const rows = await orm.select(users).all()
        for (const row of rows) {
            expect(typeof row.isActive).toBe('boolean')
        }
    })

    test('timestamp columns are deserialized as Date', async () => {
        const row = await orm.select(users).first()
        expect(row!.createdAt).toBeInstanceOf(Date)
    })

    test('nullable columns return null when null', async () => {
        const row = await orm.select(users)
            .where(isNull(users._.columns.score))
            .first()
        expect(row!.score).toBeNull()
    })
})

// ─── UPDATE ───────────────────────────────────────────────────────────────────

describe('UPDATE', () => {
    beforeEach(seedUsers)

    test('updates matching row', async () => {
        await orm.update(users)
            .set({ name: 'Alice Updated' })
            .where(eq(users._.columns.email, 'alice@example.com'))
            .execute()
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        expect(row!.name).toBe('Alice Updated')
    })

    test('returningFirst() returns updated row', async () => {
        const row = await orm.update(users)
            .set({ role: 'guest' })
            .where(eq(users._.columns.email, 'bob@example.com'))
            .returningFirst()
        expect(row!.role).toBe('guest')
    })

    test('increment() atomically increments a column', async () => {
        const before = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        await orm.update(users)
            .increment('age', 5)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .execute()
        const after = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        expect(after!.age).toBe(before!.age! + 5)
    })

    test('decrement() atomically decrements a column', async () => {
        const before = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        await orm.update(users)
            .decrement('age', 3)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .execute()
        const after = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        expect(after!.age).toBe(before!.age! - 3)
    })

    test('throws MissingWhereClauseError without .where()', async () => {
        expect(
            orm.update(users).set({ name: 'Bad' }).execute()
        ).rejects.toThrow()
    })

    test('allowGlobalOperation() permits update without WHERE', async () => {
        await orm.update(users)
            .set({ role: 'user' })
            .allowGlobalOperation()
            .execute()
        const rows = await orm.select(users).all()
        expect(rows.every(r => r.role === 'user')).toBe(true)
    })

    test('toSQL() generates correct UPDATE statement', () => {
        const { sql, params } = orm.update(users)
            .set({ name: 'Test' })
            .where(eq(users._.columns.id, 1))
            .toSQL()
        expect(sql).toContain('update')
        expect(sql).toContain('users')
        expect(sql).toContain('set')
        expect(params).toContain('Test')
    })
})

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE', () => {
    beforeEach(seedUsers)

    test('deletes matching rows', async () => {
        await orm.delete(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .execute()
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        expect(row).toBeUndefined()
    })

    test('throws MissingWhereClauseError without .where()', async () => {
        expect(orm.delete(users).execute()).rejects.toThrow()
    })

    test('allowGlobalOperation() deletes all rows', async () => {
        await orm.delete(users).allowGlobalOperation().execute()
        const rows = await orm.select(users).all()
        expect(rows).toHaveLength(0)
    })

    test('returningFirst() returns deleted row', async () => {
        const deleted = await orm.delete(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .returningFirst()
        expect(deleted?.email).toBe('alice@example.com')
    })

    test('toSQL() generates correct DELETE statement', () => {
        const { sql } = orm.delete(users)
            .where(eq(users._.columns.id, 1))
            .toSQL()
        expect(sql).toContain('delete')
        expect(sql).toContain('users')
        expect(sql).toContain('where')
    })
})

// ─── upsert() ─────────────────────────────────────────────────────────────────

describe('upsert()', () => {
    beforeEach(async () => {
        await orm.delete(users).allowGlobalOperation().execute()
    })

    test('inserts when no conflict', async () => {
        await orm.upsert(users, { name: 'New', email: 'new@u.com', isActive: true, role: 'user' }, ['email'])
        const row = await orm.select(users).where(eq(users._.columns.email, 'new@u.com')).first()
        expect(row).toBeDefined()
    })
})

// ─── count / exists / pluck / paginate ───────────────────────────────────────

describe('count() / exists() / pluck() / paginate()', () => {
    beforeAll(seedUsers)

    test('.count() returns total row count', async () => {
        expect(await orm.select(users).count()).toBe(5)
    })

    test('.count() with WHERE', async () => {
        expect(
            await orm.select(users).where(eq(users._.columns.isActive, true)).count()
        ).toBe(3)
    })

    test('.exists() returns true when rows match', async () => {
        expect(
            await orm.select(users).where(eq(users._.columns.email, 'alice@example.com')).exists()
        ).toBe(true)
    })

    test('.exists() returns false when no rows match', async () => {
        expect(
            await orm.select(users).where(eq(users._.columns.email, 'nobody@example.com')).exists()
        ).toBe(false)
    })

    test('.pluck() returns array of a single column', async () => {
        const emails = await orm.select(users)
            .orderBy(users._.columns.email, 'asc')
            .pluck('email')
        expect(Array.isArray(emails)).toBe(true)
        expect(emails.every(e => typeof e === 'string')).toBe(true)
    })

    test('.paginate() returns correct page metadata', async () => {
        const page = await orm.select(users)
            .orderBy(users._.columns.id, 'asc')
            .paginate(1, 2)
        expect(page.total).toBe(5)
        expect(page.totalPages).toBe(3)
        expect(page.data).toHaveLength(2)
        expect(page.hasNextPage).toBe(true)
        expect(page.hasPrevPage).toBe(false)
    })

    test('.paginate() second page', async () => {
        const page = await orm.select(users)
            .orderBy(users._.columns.id, 'asc')
            .paginate(2, 2)
        expect(page.data).toHaveLength(2)
        expect(page.hasPrevPage).toBe(true)
        expect(page.hasNextPage).toBe(true)
    })
})

// ─── GROUP BY / HAVING ────────────────────────────────────────────────────────

describe('GROUP BY and HAVING', () => {
    beforeAll(async () => {
        await seedUsers()
        await seedPosts()
    })

    test('GROUP BY with count', async () => {
        const rows = await orm.select(posts)
            .groupBy(posts._.columns.userId)
            .all()
        expect(rows.length).toBeGreaterThan(0)
    })
})

// ─── TRANSACTION ──────────────────────────────────────────────────────────────

describe('transaction()', () => {
    beforeEach(seedUsers)

    test('commits on success', async () => {
        await orm.transaction(async (tx) => {
            await tx.update(users)
                .set({ name: 'Tx Updated' })
                .where(eq(users._.columns.email, 'alice@example.com'))
                .execute()
        })
        const row = await orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .first()
        expect(row!.name).toBe('Tx Updated')
    })

    test('rolls back on error', async () => {
        const before = await orm.select(users).where(eq(users._.columns.email, 'bob@example.com')).first()

        try {
            await orm.transaction(async (tx) => {
                await tx.update(users)
                    .set({ name: 'Should Rollback' })
                    .where(eq(users._.columns.email, 'bob@example.com'))
                    .execute()
                throw new Error('forced rollback')
            })
        } catch {
            // expected
        }

        const after = await orm.select(users).where(eq(users._.columns.email, 'bob@example.com')).first()
        expect(after!.name).toBe(before!.name)
    })
})

// ─── toSQL() debugging ────────────────────────────────────────────────────────

describe('toSQL() debugging', () => {
    beforeAll(seedUsers)

    test('SELECT toSQL() contains table and column references', () => {
        const { sql, params } = orm.select(users)
            .where(eq(users._.columns.email, 'alice@example.com'))
            .toSQL()
        expect(sql).toContain('users')
        expect(params).toContain('alice@example.com')
    })

    test('INSERT toSQL() is valid SQL', () => {
        const { sql, params } = orm.insert(users)
            .values({ name: 'SQL Test', email: 'sqltest@example.com', isActive: true, role: 'user' })
            .toSQL()
        expect(sql.toLowerCase()).toContain('insert')
        expect(params).toContain('SQL Test')
    })

    test('UPDATE toSQL() is valid SQL', () => {
        const { sql, params } = orm.update(users)
            .set({ name: 'SQL Update' })
            .where(eq(users._.columns.id, 1))
            .toSQL()
        expect(sql.toLowerCase()).toContain('update')
        expect(params).toContain('SQL Update')
    })

    test('DELETE toSQL() is valid SQL', () => {
        const { sql } = orm.delete(users)
            .where(eq(users._.columns.id, 1))
            .toSQL()
        expect(sql.toLowerCase()).toContain('delete')
    })

    test('SQL uses $1,$2,$3 placeholders for @tauri-apps/plugin-sql compatibility', () => {
        const { sql } = orm.select(users)
            .where(eq(users._.columns.email, 'test@example.com'))
            .toSQL()
        expect(sql).toMatch(/\$1/)
        expect(sql).not.toMatch(/\?/)
    })
})
