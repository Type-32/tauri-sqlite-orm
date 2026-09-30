/**
 * Production schema adapted from Drizzle for tauri-sqlite-orm tests.
 *
 * Differences from Drizzle:
 * - references(() => table.column) - Drizzle-style lazy getter for self-refs and forward refs
 * - No composite primaryKey() - junction tables use separate columns (limitation)
 * - No index() support in table definition
 * - No onDelete/onUpdate in references (migration limitation)
 * - manyToMany uses junctionTable config (different from Drizzle's many(junction) pattern)
 */

import {
    sqliteTable,
    integer,
    text,
    boolean,
    defineRelations,
    TauriORM,
} from '../../src/index'
import { MockDatabase } from './mock-db'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const paperStatusEnum = [
    'draft',
    'submitted',
    'under_review',
    'revision_requested',
    'accepted',
    'rejected',
    'published',
] as const

export const issueStatusEnum = ['draft', 'open', 'closed', 'in_review', 'published'] as const

// ─── Tables (dependency order) ───────────────────────────────────────────────

export const user = sqliteTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .$onUpdateFn(() => new Date())
        .notNull(),
    role: text('role', { enum: ['user', 'auditor', 'moderator', 'admin'] as const })
        .default('user')
        .$defaultFn(() => 'user')
        .notNull(),
    banned: integer('banned', { mode: 'boolean' }).default(false),
    banReason: text('ban_reason'),
    banExpires: integer('ban_expires', { mode: 'timestamp' }),
    reviewWithoutInvite: integer('review_without_invite', { mode: 'boolean' })
        .default(false)
        .$defaultFn(() => false)
        .notNull(),
})

export const session = sqliteTable('session', {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .$onUpdateFn(() => new Date())
        .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => user._.columns.id),
    impersonatedBy: text('impersonated_by'),
})

export const account = sqliteTable('account', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => user._.columns.id),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .$onUpdateFn(() => new Date())
        .notNull(),
})

export const article = sqliteTable('article', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    tags: text('tags', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .$defaultFn(() => []),
    content: text('content'),
    published: integer('published', { mode: 'boolean' }).default(false).$defaultFn(() => false),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
})

export const userToArticle = sqliteTable('user_to_article', {
    userId: text('user_id').references(() => user._.columns.id),
    articleId: text('article_id')
        .notNull()
        .references(() => article._.columns.id),
    isCreator: integer('is_creator', { mode: 'boolean' })
        .notNull()
        .default(false)
        .$defaultFn(() => false),
})

export const volume = sqliteTable('volume', {
    id: integer('id').primaryKey().autoincrement(),
    volumeNumber: integer('volume_number').notNull(),
    academicYearStart: integer('academic_year_start').notNull(),
    academicYearEnd: integer('academic_year_end').notNull(),
    publishedDate: integer('published_date', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
})

export const issue = sqliteTable('issue', {
    id: integer('id').primaryKey().autoincrement(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: issueStatusEnum })
        .notNull()
        .default('draft')
        .$defaultFn(() => 'draft'),
    closeOnDeadline: integer('close_on_deadline', { mode: 'boolean' })
        .notNull()
        .default(true)
        .$defaultFn(() => true),
    deadlineDate: integer('deadline_date', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    volumeId: integer('volume_id').references(() => volume._.columns.id),
    issueNumber: integer('issue_number'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
})

export const paper = sqliteTable('paper', {
    id: integer('id').primaryKey().autoincrement(),
    title: text('title').notNull(),
    abstract: text('abstract'),
    keywords: text('keywords', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .$defaultFn(() => []),
    status: text('status', { enum: paperStatusEnum })
        .notNull()
        .default('draft')
        .$defaultFn(() => 'draft'),
    doi: text('doi'),
    html: text('html'),
    submissionDate: integer('submission_date', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    reviewedDate: integer('reviewed_date', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    publishedDate: integer('published_date', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    issueId: integer('issue_id').references(() => issue._.columns.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
})

export const userToPaper = sqliteTable('user_to_paper', {
    userId: text('user_id').references(() => user._.columns.id),
    initiatingAuthor: integer('initiating_author', { mode: 'boolean' })
        .notNull()
        .default(false)
        .$defaultFn(() => false),
    paperId: integer('paper_id')
        .notNull()
        .references(() => paper._.columns.id),
})

// ─── Relations (v2 API) ──────────────────────────────────────────────────────

const schema = { user, session, account, article, userToArticle, volume, issue, paper, userToPaper }

export const relations = defineRelations(schema, (r) => ({
    user: {
        sessions: r.many.session(),
        accounts: r.many.account(),
        usersToArticles: r.many.userToArticle(),
        usersToPapers: r.many.userToPaper(),
    },
    session: {
        user: r.one.user({ from: r.session.userId, to: r.user.id }),
    },
    account: {
        user: r.one.user({ from: r.account.userId, to: r.user.id }),
    },
    article: {
        usersToArticles: r.many.userToArticle(),
    },
    paper: {
        issue: r.one.issue({ from: r.paper.issueId, to: r.issue.id }),
        usersToPapers: r.many.userToPaper(),
    },
    volume: {
        issues: r.many.issue(),
    },
    issue: {
        volume: r.one.volume({ from: r.issue.volumeId, to: r.volume.id }),
        papers: r.many.paper(),
    },
    userToArticle: {
        user: r.one.user({ from: r.userToArticle.userId, to: r.user.id }),
        article: r.one.article({ from: r.userToArticle.articleId, to: r.article.id }),
    },
    userToPaper: {
        user: r.one.user({ from: r.userToPaper.userId, to: r.user.id }),
        paper: r.one.paper({ from: r.userToPaper.paperId, to: r.paper.id }),
    },
}))

// Per-table aliases for type inference helpers (e.g. InferRelationalSelectModel).
export const userRelations = relations.user
export const sessionRelations = relations.session
export const accountRelations = relations.account
export const articleRelations = relations.article
export const paperRelations = relations.paper
export const volumeRelations = relations.volume
export const issueRelations = relations.issue
export const userToArticleRelations = relations.userToArticle
export const userToPaperRelations = relations.userToPaper

// ─── Schema object for ORM ───────────────────────────────────────────────────

export const productionSchema = {
    user,
    session,
    account,
    article,
    userToArticle,
    volume,
    issue,
    paper,
    userToPaper,
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createProductionOrm(
    dbPath: string
): { orm: TauriORM; db: MockDatabase } {
    const db = MockDatabase.open(dbPath)
    const orm = new TauriORM(db, productionSchema)
    return { orm, db }
}
