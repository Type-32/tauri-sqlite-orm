import {
    sqliteTable,
    integer,
    text,
    boolean,
    real,
    defineRelations,
    TauriORM,
} from '../../src/index'
import { MockDatabase } from './mock-db'

// ─── Tables ──────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
    id: integer('id').primaryKey().autoincrement(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    age: integer('age'),
    score: real('score'),
    isActive: boolean('is_active').notNull().default(true),
    role: text('role', { enum: ['admin', 'user', 'guest'] as const })
        .notNull()
        .default('user'),
    metadata: text('metadata', { mode: 'json' }).$type<{ theme: string } | null>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const posts = sqliteTable('posts', {
    id: integer('id').primaryKey().autoincrement(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    userId: integer('user_id').notNull().references(() => users._.columns.id),
    views: integer('views').notNull().default(0),
    published: boolean('published').notNull().default(false),
})

export const tags = sqliteTable('tags', {
    id: integer('id').primaryKey().autoincrement(),
    name: text('name').notNull().unique(),
})

export const postTags = sqliteTable('post_tags', {
    postId: integer('post_id').notNull().references(() => posts._.columns.id),
    tagId: integer('tag_id').notNull().references(() => tags._.columns.id),
})

// ─── Relations (v2 API) ───────────────────────────────────────────────────────

export const schema = { users, posts, tags, postTags }

defineRelations(schema, (r) => ({
    users: {
        posts: r.many.posts(),
    },
    posts: {
        user: r.one.users({ from: r.posts.userId, to: r.users.id }),
        postTags: r.many.postTags(),
    },
    tags: {
        postTags: r.many.postTags(),
    },
    postTags: {
        post: r.one.posts({ from: r.postTags.postId, to: r.posts.id }),
        tag: r.one.tags({ from: r.postTags.tagId, to: r.tags.id }),
    },
}))

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOrm(dbPath: string): { orm: TauriORM; db: MockDatabase } {
    const db = MockDatabase.open(dbPath)
    const orm = new TauriORM(db, schema)
    return { orm, db }
}
