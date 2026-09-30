import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { sql } from '../src/index'
import { relationalQuery, type RelationalQueryAPI } from '../src/queries-v2'
import { createOrmV2, users, posts, tags, postTags } from './helpers/schema-v2'
import { removeDb } from './helpers/mock-db'

const DB_PATH = 'queries-v2-test.db'

type Tables = { users: typeof users; posts: typeof posts; tags: typeof tags; postTags: typeof postTags }
let rq: RelationalQueryAPI<Tables>
let db: { close(): void }

beforeAll(async () => {
    removeDb(DB_PATH)
    const { orm, db: mockDb } = createOrmV2(DB_PATH)
    db = mockDb
    await orm.migrate()

    await orm.insert(users).values({ name: 'Alice', email: 'alice@q2.com', age: 30, isActive: true, role: 'admin' }).execute()
    await orm.insert(users).values({ name: 'Bob', email: 'bob@q2.com', age: 25, isActive: true, role: 'user' }).execute()
    // Carol has no age (null)
    await orm.insert(users).values({ name: 'Carol', email: 'carol@q2.com', isActive: true, role: 'user' }).execute()

    await orm.insert(posts).values({ title: 'A1', content: 'x', userId: 1, views: 100, published: true }).execute()
    await orm.insert(posts).values({ title: 'A2', content: 'x', userId: 1, views: 50, published: false }).execute()

    await orm.insert(tags).values({ name: 'javascript' }).execute()
    await orm.insert(tags).values({ name: 'typescript' }).execute()
    await orm.insert(postTags).values([
        { postId: 1, tagId: 1 },
        { postId: 1, tagId: 2 },
    ]).execute()

    rq = relationalQuery(orm, { users, posts, tags, postTags })
})

afterAll(() => {
    db.close()
    removeDb(DB_PATH)
})

describe('queries v2 (experimental): findMany / findFirst', () => {
    test('findMany() returns all rows', async () => {
        const rows = await rq.query.users.findMany()
        expect(rows).toHaveLength(3)
    })

    test('findMany({ where }) equality', async () => {
        const rows = await rq.query.users.findMany({ where: { name: 'Alice' } })
        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Alice')
    })

    test('findMany({ where }) operator object', async () => {
        const rows = await rq.query.users.findMany({ where: { age: { gt: 26 } } })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('findMany({ where }) isNull', async () => {
        const rows = await rq.query.users.findMany({ where: { age: { isNull: true } } })
        expect(rows.map((r) => r.name)).toEqual(['Carol'])
    })

    test('findMany({ where }) between', async () => {
        const rows = await rq.query.users.findMany({ where: { age: { between: [20, 28] } } })
        expect(rows.map((r) => r.name)).toEqual(['Bob'])
    })

    test('findMany({ where }) AND / OR / NOT', async () => {
        const andRows = await rq.query.users.findMany({ where: { AND: [{ age: { gte: 25 } }, { role: 'admin' }] } })
        expect(andRows.map((r) => r.name)).toEqual(['Alice'])

        const orRows = await rq.query.users.findMany({ where: { OR: [{ name: 'Alice' }, { name: 'Bob' }] } })
        expect(orRows).toHaveLength(2)

        const notRows = await rq.query.users.findMany({ where: { NOT: { role: 'admin' } } })
        expect(notRows.map((r) => r.name).sort()).toEqual(['Bob', 'Carol'])
    })

    test('findMany({ where }) string operators', async () => {
        expect((await rq.query.users.findMany({ where: { name: { like: 'Al%' } } })).map((r) => r.name)).toEqual(['Alice'])
        expect((await rq.query.users.findMany({ where: { name: { startsWith: 'Al' } } })).map((r) => r.name)).toEqual(['Alice'])
        expect((await rq.query.users.findMany({ where: { name: { endsWith: 'b' } } })).map((r) => r.name)).toEqual(['Bob'])
        expect((await rq.query.users.findMany({ where: { name: { contains: 'ar' } } })).map((r) => r.name)).toEqual(['Carol'])
    })

    test('findMany({ where }) inArray / notInArray', async () => {
        expect(await rq.query.users.findMany({ where: { name: { inArray: ['Alice', 'Bob'] } } })).toHaveLength(2)
        expect((await rq.query.users.findMany({ where: { name: { notInArray: ['Alice'] } } })).map((r) => r.name).sort()).toEqual(['Bob', 'Carol'])
    })

    test('findMany({ where }) RAW', async () => {
        const rows = await rq.query.users.findMany({
            where: { RAW: (cols) => sql`LOWER(${sql.ref(cols.name._.name)}) = 'alice'` },
        })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('findMany({ orderBy }) object', async () => {
        const asc = await rq.query.users.findMany({ orderBy: { name: 'asc' } })
        expect(asc.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Carol'])

        const desc = await rq.query.users.findMany({ orderBy: { name: 'desc' } })
        expect(desc.map((r) => r.name)).toEqual(['Carol', 'Bob', 'Alice'])
    })

    test('findMany({ limit, offset })', async () => {
        const limited = await rq.query.users.findMany({ orderBy: { name: 'asc' }, limit: 2 })
        expect(limited.map((r) => r.name)).toEqual(['Alice', 'Bob'])

        const offset = await rq.query.users.findMany({ orderBy: { name: 'asc' }, offset: 1 })
        expect(offset.map((r) => r.name)).toEqual(['Bob', 'Carol'])
    })

    test('findMany({ with }) loads relations via include', async () => {
        type UserWithPosts = { name: string; posts: { title: string }[] }
        const rows = (await rq.query.users.findMany({ with: { posts: true } })) as unknown as UserWithPosts[]

        const alice = rows.find((r) => r.name === 'Alice')!
        const bob = rows.find((r) => r.name === 'Bob')!
        expect(alice.posts).toHaveLength(2)
        expect(bob.posts).toHaveLength(0)
    })

    test('findMany({ with }) nested relation', async () => {
        type UserWithPostAuthor = { name: string; posts: { title: string; user: { name: string } }[] }
        const rows = (await rq.query.users.findMany({
            with: { posts: { with: { user: true } } },
        })) as unknown as UserWithPostAuthor[]

        const alice = rows.find((r) => r.name === 'Alice')!
        expect(alice.posts).toHaveLength(2)
        expect(alice.posts.every((p) => p.user.name === 'Alice')).toBe(true)
    })

    test('findMany({ with }) many-to-many through()', async () => {
        type PostWithTags = { title: string; tags: { name: string }[] }
        const rows = (await rq.query.posts.findMany({
            where: { title: 'A1' },
            with: { tags: true },
        })) as unknown as PostWithTags[]

        expect(rows).toHaveLength(1)
        expect(rows[0].tags.map((t) => t.name).sort()).toEqual(['javascript', 'typescript'])
    })

    test('findMany({ with }) column selection on a relation', async () => {
        type PostWithPostTags = { title: string; postTags: { postId: number; tag: { name: string } }[] }
        const rows = (await rq.query.posts.findMany({
            where: { title: 'A1' },
            with: { postTags: { columns: ['postId'], with: { tag: true } } },
        })) as unknown as PostWithPostTags[]

        expect(rows).toHaveLength(1)
        expect(rows[0].postTags).toHaveLength(2)
        expect(rows[0].postTags[0].postId).toBe(1)
        expect(rows[0].postTags[0].tag.name).toBeDefined()
    })

    test('findFirst({ with }) loads relations', async () => {
        type UserWithPosts = { name: string; posts: unknown[] }
        const alice = (await rq.query.users.findFirst({
            where: { name: 'Alice' },
            with: { posts: true },
        })) as unknown as UserWithPosts | undefined

        expect(alice?.name).toBe('Alice')
        expect(alice?.posts).toHaveLength(2)
    })

    test('findFirst() returns first match or undefined', async () => {
        const alice = await rq.query.users.findFirst({ where: { name: 'Alice' } })
        expect(alice?.name).toBe('Alice')

        const none = await rq.query.users.findFirst({ where: { name: 'Nobody' } })
        expect(none).toBeUndefined()
    })
})

describe('queries v2 (experimental): $count', () => {
    test('counts all rows', async () => {
        expect(await rq.$count(users)).toBe(3)
    })

    test('counts with a filter', async () => {
        expect(await rq.$count(users, { role: 'admin' })).toBe(1)
        expect(await rq.$count(users, { age: { gte: 25 } })).toBe(2)
    })

    test('counts with a relation filter', async () => {
        expect(await rq.$count(users, { posts: { published: true } })).toBe(1)
    })
})

describe('queries v2 (experimental): filtering by relations', () => {
    test('where: { posts: { ... } } keeps only users with a matching post', async () => {
        const rows = await rq.query.users.findMany({ where: { posts: { published: true } } })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('where: { posts: { ... } } with operator sub-filter', async () => {
        const rows = await rq.query.users.findMany({ where: { posts: { title: { like: 'A%' } } } })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('where: { posts: { ... } } negative case', async () => {
        const rows = await rq.query.users.findMany({ where: { posts: { published: false } } })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('filters by a `one` relation (reverse direction)', async () => {
        const rows = await rq.query.posts.findMany({ where: { user: { name: 'Alice' } } })
        expect(rows.map((r) => r.title).sort()).toEqual(['A1', 'A2'])
    })

    test('filters by a many-to-many relation via through()', async () => {
        const rows = await rq.query.posts.findMany({ where: { tags: { name: 'javascript' } } })
        expect(rows.map((r) => r.title)).toEqual(['A1'])
    })

    test('nested relation filter (relation within relation)', async () => {
        const rows = await rq.query.users.findMany({ where: { posts: { user: { name: 'Alice' } } } })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })

    test('AND combining a column and a relation filter', async () => {
        const rows = await rq.query.users.findMany({
            where: { AND: [{ age: { gt: 26 } }, { posts: { published: true } }] },
        })
        expect(rows.map((r) => r.name)).toEqual(['Alice'])
    })
})

describe('queries v2 (experimental): per-relation filters in with', () => {
    test('with: { posts: { where } } filters the loaded relation array', async () => {
        type UserWithPosts = { name: string; posts: { title: string }[] }
        const rows = (await rq.query.users.findMany({
            with: { posts: { where: { published: true } } },
        })) as unknown as UserWithPosts[]

        const alice = rows.find((r) => r.name === 'Alice')!
        expect(alice.posts).toHaveLength(1)
        expect(alice.posts[0].title).toBe('A1')
    })

    test('with: { posts: { orderBy } } sorts the loaded relation array', async () => {
        type UserWithPosts = { name: string; posts: { title: string }[] }
        const rows = (await rq.query.users.findMany({
            with: { posts: { orderBy: { title: 'desc' } } },
        })) as unknown as UserWithPosts[]

        const alice = rows.find((r) => r.name === 'Alice')!
        expect(alice.posts.map((p) => p.title)).toEqual(['A2', 'A1'])
    })

    test('with: { posts: { orderBy, limit } } slices the relation array', async () => {
        type UserWithPosts = { name: string; posts: { title: string }[] }
        const rows = (await rq.query.users.findMany({
            with: { posts: { orderBy: { title: 'asc' }, limit: 1 } },
        })) as unknown as UserWithPosts[]

        const alice = rows.find((r) => r.name === 'Alice')!
        expect(alice.posts.map((p) => p.title)).toEqual(['A1'])
    })

    test('with: { posts: { orderBy, offset } } offsets the relation array', async () => {
        type UserWithPosts = { name: string; posts: { title: string }[] }
        const rows = (await rq.query.users.findMany({
            with: { posts: { orderBy: { title: 'asc' }, offset: 1 } },
        })) as unknown as UserWithPosts[]

        const alice = rows.find((r) => r.name === 'Alice')!
        expect(alice.posts.map((p) => p.title)).toEqual(['A2'])
    })
})
