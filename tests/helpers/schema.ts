import {
    sqliteTable,
    integer,
    text,
    boolean,
    real,
    relations,
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
    userId: integer('user_id').notNull().references(users, 'id'),
    views: integer('views').notNull().default(0),
    published: boolean('published').notNull().default(false),
})

export const tags = sqliteTable('tags', {
    id: integer('id').primaryKey().autoincrement(),
    name: text('name').notNull().unique(),
})

export const postTags = sqliteTable('post_tags', {
    postId: integer('post_id').notNull().references(posts, 'id'),
    tagId: integer('tag_id').notNull().references(tags, 'id'),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
}))

export const postsRelations = relations(posts, ({ one, manyToMany }) => ({
    user: one(users, {
        fields: [posts._.columns.userId],
        references: [users._.columns.id],
    }),
    tags: manyToMany(tags, {
        junctionTable: postTags,
        junctionFields: [postTags._.columns.postId],
        junctionReferences: [postTags._.columns.tagId],
    }),
}))

export const schema = {
    users,
    usersRelations,
    posts,
    postsRelations,
    tags,
    postTags,
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOrm(dbPath: string): { orm: TauriORM; db: MockDatabase } {
    const db = MockDatabase.open(dbPath)
    const orm = new TauriORM(db, schema)
    return { orm, db }
}
