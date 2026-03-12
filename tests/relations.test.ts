import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { eq, inArray, exists, sqliteTable, integer, text, relations, TauriORM } from '../src/index'
import { subquery } from '../src/subquery'
import { MockDatabase, removeDb } from './helpers/mock-db'
import { createOrm, users, posts, tags, postTags } from './helpers/schema'

const DB_PATH = 'relations-test.db'

let orm: TauriORM
let db: MockDatabase

// Seeded IDs for assertions
let aliceId: number
let bobId: number
let post1Id: number
let post2Id: number
let post3Id: number
let tagJsId: number
let tagTsId: number

beforeAll(async () => {
    removeDb(DB_PATH)
    ;({ orm, db } = createOrm(DB_PATH))
    await orm.migrate()

    // Users
    const alice = await orm.insert(users)
        .values({ name: 'Alice', email: 'alice@rel.com', age: 30, isActive: true, role: 'admin' })
        .returningFirst()
    const bob = await orm.insert(users)
        .values({ name: 'Bob', email: 'bob@rel.com', age: 25, isActive: true, role: 'user' })
        .returningFirst()
    aliceId = alice!.id
    bobId = bob!.id

    // Posts
    const p1 = await orm.insert(posts)
        .values({ title: 'Alice Post 1', content: 'content', userId: aliceId, views: 100, published: true })
        .returningFirst()
    const p2 = await orm.insert(posts)
        .values({ title: 'Alice Post 2', content: 'content', userId: aliceId, views: 50, published: false })
        .returningFirst()
    const p3 = await orm.insert(posts)
        .values({ title: 'Bob Post 1', content: 'content', userId: bobId, views: 10, published: true })
        .returningFirst()
    post1Id = p1!.id
    post2Id = p2!.id
    post3Id = p3!.id

    // Tags
    const js = await orm.insert(tags).values({ name: 'javascript' }).returningFirst()
    const ts = await orm.insert(tags).values({ name: 'typescript' }).returningFirst()
    tagJsId = js!.id
    tagTsId = ts!.id

    // Post-tags (many-to-many)
    await orm.insert(postTags).values([
        { postId: post1Id, tagId: tagJsId },
        { postId: post1Id, tagId: tagTsId },
        { postId: post3Id, tagId: tagJsId },
    ]).execute()
})

afterAll(() => {
    db.close()
    removeDb(DB_PATH)
})

// ─── One-to-many: users → posts ───────────────────────────────────────────────

describe('One-to-many: users.include({ posts })', () => {
    test('loads related posts for each user', async () => {
        const rows = await orm.select(users)
            .include({ posts: true })
            .all()

        const alice = rows.find(r => r.id === aliceId)
        const bob = rows.find(r => r.id === bobId)

        expect(alice).toBeDefined()
        expect(bob).toBeDefined()
        expect(alice!.posts).toHaveLength(2)
        expect(bob!.posts).toHaveLength(1)
    })

    test('post titles are correct', async () => {
        const [alice] = await orm.select(users)
            .where(eq(users._.columns.id, aliceId, users._.name))
            .include({ posts: true })
            .all()

        const titles = (alice.posts as any[]).map((p: any) => p.title)
        expect(titles).toContain('Alice Post 1')
        expect(titles).toContain('Alice Post 2')
    })

    test('user with no posts has empty array', async () => {
        // Add a user with no posts
        const lonely = await orm.insert(users)
            .values({ name: 'Lonely', email: 'lonely@rel.com', isActive: true, role: 'user' })
            .returningFirst()

        const [row] = await orm.select(users)
            .where(eq(users._.columns.id, lonely!.id, users._.name))
            .include({ posts: true })
            .all()

        expect((row as any).posts ?? []).toHaveLength(0)

        await orm.delete(users).where(eq(users._.columns.id, lonely!.id, users._.name)).execute()
    })
})

// ─── Many-to-one: posts → user ────────────────────────────────────────────────

describe('Many-to-one: posts.include({ user })', () => {
    test('loads the related user for each post', async () => {
        const rows = await orm.select(posts)
            .include({ user: true })
            .all()

        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect((row as any).user).toBeDefined()
            expect(typeof (row as any).user.name).toBe('string')
        }
    })

    test('user data matches seeded data', async () => {
        const [p1] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ user: true })
            .all()

        expect((p1 as any).user.name).toBe('Alice')
        expect((p1 as any).user.email).toBe('alice@rel.com')
    })
})

// ─── Many-to-many (Drizzle-style): posts → postTags → tags ────────────────────

describe('Many-to-many: posts.include({ postTags: { with: { tag: true } } })', () => {
    test('loads postTags with nested tag for posts through junction', async () => {
        const rows = await orm.select(posts)
            .include({ postTags: { with: { tag: true } } })
            .all()

        const p1 = rows.find(r => r.id === post1Id) as any
        expect(p1).toBeDefined()
        expect(p1.postTags).toHaveLength(2)

        const tagNames = p1.postTags.map((pt: any) => pt.tag.name)
        expect(tagNames).toContain('javascript')
        expect(tagNames).toContain('typescript')
    })

    test('post with one tag loads correctly', async () => {
        const [p3] = await orm.select(posts)
            .where(eq(posts._.columns.id, post3Id, posts._.name))
            .include({ postTags: { with: { tag: true } } })
            .all()

        expect((p3 as any).postTags).toHaveLength(1)
        expect((p3 as any).postTags[0].tag.name).toBe('javascript')
    })

    test('post with no tags has empty array', async () => {
        const [p2] = await orm.select(posts)
            .where(eq(posts._.columns.id, post2Id, posts._.name))
            .include({ postTags: true })
            .all()

        expect((p2 as any).postTags ?? []).toHaveLength(0)
    })

    test('postTags only (without nested tag)', async () => {
        const [p1] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ postTags: true })
            .all()

        expect((p1 as any).postTags).toHaveLength(2)
        expect((p1 as any).postTags[0]).toHaveProperty('postId')
        expect((p1 as any).postTags[0]).toHaveProperty('tagId')
    })
})

// ─── Column selection in relations ───────────────────────────────────────────

describe('Column selection in includes', () => {
    test('postTags with columns + nested tag with columns', async () => {
        const [p1] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({
                postTags: {
                    columns: ['postId', 'tagId'],
                    with: { tag: { columns: { id: true, name: true } } },
                },
            })
            .all()
        expect((p1 as any).postTags).toHaveLength(2)
        expect((p1 as any).postTags[0].postId).toBe(post1Id)
        expect((p1 as any).postTags[0].tag).toBeDefined()
        expect((p1 as any).postTags[0].tag.name).toBeDefined()
        expect((p1 as any).postTags[0].tag.id).toBeDefined()
    })
})

// ─── Combined includes ────────────────────────────────────────────────────────

describe('Combined includes: posts.include({ user, postTags: { with: { tag: true } } })', () => {
    test('loads both user and postTags with tags simultaneously', async () => {
        const [p1] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ user: true, postTags: { with: { tag: true } } })
            .all()

        expect((p1 as any).user).toBeDefined()
        expect((p1 as any).user.name).toBe('Alice')
        expect((p1 as any).postTags).toHaveLength(2)
        expect((p1 as any).postTags[0].tag.name).toBeDefined()
    })
})

// ─── Subquery operators ───────────────────────────────────────────────────────

describe('Subquery operators', () => {
    test('inArray with subquery', async () => {
        const postsForAlice = orm.select(posts, ['userId'])
            .where(eq(posts._.columns.userId, aliceId))

        const result = await orm.select(users)
            .where(inArray(users._.columns.id, subquery(postsForAlice)))
            .all()

        expect(result.every(r => r.id === aliceId)).toBe(true)
    })

    test('exists() with subquery', async () => {
        const publishedPostsForUser = orm.select(posts)
            .where(
                eq(posts._.columns.userId, aliceId)
            )

        const result = await orm.select(users)
            .where(exists(subquery(publishedPostsForUser)))
            .all()

        expect(result.length).toBeGreaterThan(0)
    })
})

// ─── Manual JOINs ────────────────────────────────────────────────────────────

describe('Self-reference include (quotingMessage)', () => {
    const DB_SELF = 'relations-self-ref.db'
    let ormSelf: TauriORM
    let dbSelf: MockDatabase

    const messages = sqliteTable('_msg', {
        id: integer('id').primaryKey().autoincrement(),
        text: text('text').notNull(),
        quotingMessageId: integer('quoting_message_id').references(() => messages._.columns.id),
    })
    const messagesRelations = relations(messages, ({ one }) => ({
        quotingMessage: one(messages, {
            fields: [messages._.columns.quotingMessageId],
            references: [messages._.columns.id],
        }),
    }))
    const schemaSelf = { _msg: messages, _msgRelations: messagesRelations }

    beforeAll(async () => {
        removeDb(DB_SELF)
        dbSelf = MockDatabase.open(DB_SELF)
        ormSelf = new TauriORM(dbSelf, schemaSelf)
        await ormSelf.migrate()
        await ormSelf.insert(messages).values({ text: 'First' }).execute()
        const m2 = await ormSelf.insert(messages).values({ text: 'Reply', quotingMessageId: 1 }).returningFirst()
        expect(m2?.quotingMessageId).toBe(1)
    })

    afterAll(() => {
        dbSelf.close()
        removeDb(DB_SELF)
    })

    test('include quotingMessage with where/orderBy avoids ambiguous column', async () => {
        // Previously: "ambiguous column name: conversation_id" when including self-ref + other relations.
        // Fix: wrap base in subquery when self-ref is included so WHERE/ORDER BY run in single-table context.
        const rows = await ormSelf
            .select(messages)
            .where(eq(messages._.columns.id, 2))
            .orderBy(messages._.columns.id, 'asc')
            .include({ quotingMessage: true })
            .all()
        expect(rows).toHaveLength(1)
        expect(rows[0].text).toBe('Reply')
        // Query runs without "ambiguous column name" error (fix: subquery when self-ref included)
    })
})

describe('Manual leftJoin()', () => {
    test('joins users with their posts manually', async () => {
        const { sql: joinCondition } = { sql: 'posts.user_id = users.id' }
        // Use eq with column references via sql template
        const { sql: kysely_sql } = await import('../src/index')

        const rows = await orm.select(users)
            .leftJoin(
                posts,
                kysely_sql`posts.user_id = users.id`,
                'posts'
            )
            .all()

        expect(rows.length).toBeGreaterThan(0)
    })
})
