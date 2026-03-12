import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from '../src/index'
import { MockDatabase, removeDb } from './helpers/mock-db'
import { createOrmV2, users, posts, tags, postTags } from './helpers/schema-v2'
import type { TauriORM } from '../src/index'

const DB_PATH = 'relations-v2-test.db'

let orm: TauriORM
let db: MockDatabase

let aliceId: number
let bobId: number
let post1Id: number
let tagJsId: number
let tagTsId: number

beforeAll(async () => {
    removeDb(DB_PATH)
    ;({ orm, db } = createOrmV2(DB_PATH))
    await orm.migrate()

    const alice = await orm.insert(users)
        .values({ name: 'Alice', email: 'alice@v2.com', age: 30, isActive: true, role: 'admin' })
        .returningFirst()
    const bob = await orm.insert(users)
        .values({ name: 'Bob', email: 'bob@v2.com', age: 25, isActive: true, role: 'user' })
        .returningFirst()
    aliceId = alice!.id
    bobId = bob!.id

    const p1 = await orm.insert(posts)
        .values({ title: 'Alice Post 1', content: 'content', userId: aliceId, views: 100, published: true })
        .returningFirst()
    post1Id = p1!.id

    const js = await orm.insert(tags).values({ name: 'javascript' }).returningFirst()
    const ts = await orm.insert(tags).values({ name: 'typescript' }).returningFirst()
    tagJsId = js!.id
    tagTsId = ts!.id

    await orm.insert(postTags).values([
        { postId: post1Id, tagId: tagJsId },
        { postId: post1Id, tagId: tagTsId },
    ]).execute()
})

afterAll(() => {
    db.close()
    removeDb(DB_PATH)
})

describe('Relations v2: defineRelations with from/to', () => {
    test('one-to-many: users.include({ posts })', async () => {
        const rows = await orm.select(users)
            .include({ posts: true })
            .all()

        const alice = rows.find(r => r.id === aliceId)
        expect(alice).toBeDefined()
        expect((alice as any).posts).toHaveLength(1)
        expect((alice as any).posts[0].title).toBe('Alice Post 1')
    })

    test('many-to-one: posts.include({ user })', async () => {
        const [post] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ user: true })
            .all()

        expect(post).toBeDefined()
        expect((post as any).user).toBeDefined()
        expect((post as any).user.name).toBe('Alice')
    })

    test('many-to-many: posts.include({ postTags: { with: { tag: true } } })', async () => {
        const [post] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ postTags: { with: { tag: true } } })
            .all()

        expect(post).toBeDefined()
        expect((post as any).postTags).toHaveLength(2)
        const tagNames = (post as any).postTags.map((pt: any) => pt.tag.name).sort()
        expect(tagNames).toEqual(['javascript', 'typescript'])
    })

    test('many-to-many via through(): posts.include({ tags: true })', async () => {
        const [post] = await orm.select(posts)
            .where(eq(posts._.columns.id, post1Id, posts._.name))
            .include({ tags: true })
            .all()

        expect(post).toBeDefined()
        expect((post as any).tags).toHaveLength(2)
        const tagNames = (post as any).tags.map((t: any) => t.name).sort()
        expect(tagNames).toEqual(['javascript', 'typescript'])
    })

    test('predefined where filter: users.include({ publishedPosts: true })', async () => {
        const [alice] = await orm.select(users)
            .where(eq(users._.columns.id, aliceId, users._.name))
            .include({ publishedPosts: true })
            .all()

        expect(alice).toBeDefined()
        // Alice has 1 post, and it's published (published: true)
        expect((alice as any).publishedPosts).toHaveLength(1)
        expect((alice as any).publishedPosts[0].published).toBe(true)
    })
})
