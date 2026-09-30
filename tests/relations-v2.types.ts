// Type-level tests for Relations v2. Verified with `tsc --noEmit` (not run by `bun test`).
// These assert that optional: false removes null, many yields arrays, and nested includes infer.

import {
    sqliteTable,
    integer,
    text,
    defineRelations,
    InferSelectModel,
    InferRelationalSelectModel,
} from '../src/index'

const users = sqliteTable('users', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
})

const posts = sqliteTable('posts', {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    userId: integer('user_id').notNull().references(() => users._.columns.id),
})

type User = InferSelectModel<typeof users>

// ── optional: false => non-null ──────────────────────────────────────────────
const requiredRelations = defineRelations({ users, posts }, (r) => ({
    posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id, optional: false }) },
}))

type WithRequiredAuthor = InferRelationalSelectModel<
    typeof posts,
    typeof requiredRelations.posts,
    { author: true }
>

const requiredAuthor: WithRequiredAuthor['author'] = { id: 1, name: 'Alice' }
// @ts-expect-error — author is required (non-null), null is not assignable
const requiredAuthorBad: WithRequiredAuthor['author'] = null

// ── default => nullable ──────────────────────────────────────────────────────
const optionalRelations = defineRelations({ users, posts }, (r) => ({
    posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
}))

type WithOptionalAuthor = InferRelationalSelectModel<
    typeof posts,
    typeof optionalRelations.posts,
    { author: true }
>

const optionalAuthorNull: WithOptionalAuthor['author'] = null
const optionalAuthorValue: WithOptionalAuthor['author'] = { id: 1, name: 'Alice' }

// ── many => array ────────────────────────────────────────────────────────────
const manyRelations = defineRelations({ users, posts }, (r) => ({
    users: { posts: r.many.posts({ from: r.users.id, to: r.posts.userId }) },
}))

type UserWithPosts = InferRelationalSelectModel<typeof users, typeof manyRelations.users, { posts: true }>

const userPosts: UserWithPosts['posts'] = [{ id: 1, title: 't', userId: 1 }]
// @ts-expect-error — posts is an array, not a single object
const userPostsBad: UserWithPosts['posts'] = { id: 1, title: 't', userId: 1 }

// ── nested include (back-reference many -> one) ──────────────────────────────
const nestedRelations = defineRelations({ users, posts }, (r) => ({
    users: { posts: r.many.posts() },
    posts: { author: r.one.users({ from: r.posts.userId, to: r.users.id }) },
}))

type UserWithNested = InferRelationalSelectModel<
    typeof users,
    typeof nestedRelations.users,
    { posts: { with: { author: true } } },
    { users: typeof nestedRelations.users; posts: typeof nestedRelations.posts }
>

const nestedAuthor: UserWithNested['posts'][number]['author'] = { id: 1, name: 'Alice' }
const nestedPostTitle: UserWithNested['posts'][number]['title'] = 'Hello'

// Silence unused-variable warnings by exporting the inferred types.
export type _TypeAssertions = [
    WithRequiredAuthor['author'],
    WithOptionalAuthor['author'],
    UserWithPosts['posts'],
    UserWithNested['posts'],
]
