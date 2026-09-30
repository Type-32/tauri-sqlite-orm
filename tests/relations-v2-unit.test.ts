import { describe, test, expect } from 'bun:test'
import {
    sqliteTable,
    integer,
    text,
    boolean,
    defineRelations,
    defineRelationsPart,
    eq,
} from '../src/index'

// Unit tests for the Relations v2 API: verify the internal relation config that
// the query builder consumes. These catch a wrong from/to -> fields/references
// mapping (which would silently produce wrong JOIN conditions in production).

describe('Relations v2: defineRelations config mapping', () => {
    test('one relation maps from -> fields and to -> references', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        defineRelations({ users, posts }, (r) => ({
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
        }))

        const config = posts.relations['author']
        expect(config.type).toBe('one')
        expect(config.foreignTable).toBe(users)
        expect(config.fields!.map((c) => c._.name)).toEqual(['user_id'])
        expect(config.references!.map((c) => c._.name)).toEqual(['id'])
    })

    test('many with explicit from/to maps to (fields=foreign FK, references=parent PK)', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        defineRelations({ users, posts }, (r) => ({
            users: { posts: r.many.posts({ from: r.users.id, to: r.posts.userId }) },
        }))

        const config = users.relations['posts']
        expect(config.type).toBe('many')
        expect(config.foreignTable).toBe(posts)
        // JOIN is `posts.<fields> = users.<references>` -> fields = foreign FK, references = parent PK.
        expect(config.fields!.map((c) => c._.name)).toEqual(['user_id'])
        expect(config.references!.map((c) => c._.name)).toEqual(['id'])
    })

    test('many back-reference (no from/to) stores no fields/references', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        defineRelations({ users, posts }, (r) => ({
            users: { posts: r.many.posts() },
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
        }))

        const config = users.relations['posts']
        expect(config.type).toBe('many')
        expect(config.foreignTable).toBe(posts)
        expect(config.fields).toBeUndefined()
        expect(config.references).toBeUndefined()
    })

    test('through() many-to-many maps to junctionTable + fromJunction + toJunction', () => {
        const posts = sqliteTable('posts', { id: integer('id').primaryKey() })
        const tags = sqliteTable('tags', { id: integer('id').primaryKey() })
        const postTags = sqliteTable('post_tags', {
            postId: integer('post_id').notNull().references(() => posts._.columns.id),
            tagId: integer('tag_id').notNull().references(() => tags._.columns.id),
        })

        defineRelations({ posts, tags, postTags }, (r) => ({
            posts: {
                tags: r.many.tags({
                    from: r.posts.id.through(r.postTags.postId),
                    to: r.tags.id.through(r.postTags.tagId),
                }),
            },
        }))

        const config = posts.relations['tags']
        expect(config.type).toBe('many')
        expect(config.foreignTable).toBe(tags)
        expect(config.junctionTable).toBe(postTags)
        expect(config.fromJunction!.column).toBe(posts._.columns.id)
        expect(config.fromJunction!.junctionColumn).toBe(postTags._.columns.postId)
        expect(config.toJunction!.junctionColumn).toBe(postTags._.columns.tagId)
        expect(config.toJunction!.column).toBe(tags._.columns.id)
    })

    test('optional: false propagates to config', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        defineRelations({ users, posts }, (r) => ({
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id, optional: false }) },
        }))

        expect(posts.relations['author'].optional).toBe(false)
    })

    test('alias propagates to config', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        defineRelations({ users, posts }, (r) => ({
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id, alias: 'author_user' }) },
        }))

        expect(posts.relations['author'].alias).toBe('author_user')
    })

    test('where filter propagates to config', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
            published: boolean('published').notNull().default(false),
        })

        const whereFn = (alias: string) => eq(posts._.columns.published, true, alias)
        defineRelations({ users, posts }, (r) => ({
            users: {
                publishedPosts: r.many.posts({ from: r.users.id, to: r.posts.userId, where: whereFn }),
            },
        }))

        expect(users.relations['publishedPosts'].where).toBe(whereFn)
    })
})

describe('Relations v2: through() chaining', () => {
    test('resolves the junction table from the junction column', () => {
        const posts = sqliteTable('posts', { id: integer('id').primaryKey() })
        const tags = sqliteTable('tags', { id: integer('id').primaryKey() })
        const postTags = sqliteTable('post_tags', {
            postId: integer('post_id').notNull().references(() => posts._.columns.id),
            tagId: integer('tag_id').notNull().references(() => tags._.columns.id),
        })

        const ref = posts._.columns.id.through(postTags._.columns.postId)
        expect(ref.column).toBe(posts._.columns.id)
        expect(ref.junctionColumn).toBe(postTags._.columns.postId)
        expect(ref.junctionTable).toBe(postTags)
    })

    test('throws when the junction column is not attached to a table', () => {
        const posts = sqliteTable('posts', { id: integer('id').primaryKey() })
        const detached = integer('detached')

        expect(() => posts._.columns.id.through(detached)).toThrow(/not attached to a table/)
    })
})

describe('Relations v2: defineRelations return value', () => {
    test('returns only the relations defined, keyed by table name', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })
        const orphan = sqliteTable('orphan', { id: integer('id').primaryKey() })

        const relations = defineRelations({ users, posts, orphan }, (r) => ({
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
        }))

        expect(Object.keys(relations)).toEqual(['posts'])
        expect(Object.keys(relations.posts)).toEqual(['author'])
    })

    test('defineRelationsPart attaches relations and returns only what it defines', () => {
        const users = sqliteTable('users', { id: integer('id').primaryKey() })
        const posts = sqliteTable('posts', {
            id: integer('id').primaryKey(),
            userId: integer('user_id').notNull().references(() => users._.columns.id),
        })

        const part = defineRelationsPart({ users, posts }, (r) => ({
            posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
        }))

        expect(posts.relations['author'].type).toBe('one')
        expect(Object.keys(part)).toEqual(['posts'])
    })
})
