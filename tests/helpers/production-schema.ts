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
    relations,
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

// ─── Relations ──────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    usersToArticles: many(userToArticle),
    usersToPapers: many(userToPaper),
}))

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session._.columns.userId],
        references: [user._.columns.id],
    }),
}))

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account._.columns.userId],
        references: [user._.columns.id],
    }),
}))

export const articleRelations = relations(article, ({ many }) => ({
    usersToArticles: many(userToArticle),
}))

export const paperRelations = relations(paper, ({ one, many }) => ({
    issue: one(issue, {
        fields: [paper._.columns.issueId],
        references: [issue._.columns.id],
    }),
    usersToPapers: many(userToPaper),
}))

export const volumeRelations = relations(volume, ({ many }) => ({
    issues: many(issue),
}))

export const issueRelations = relations(issue, ({ one, many }) => ({
    volume: one(volume, {
        fields: [issue._.columns.volumeId],
        references: [volume._.columns.id],
    }),
    papers: many(paper),
}))

export const userToArticleRelations = relations(userToArticle, ({ one }) => ({
    user: one(user, {
        fields: [userToArticle._.columns.userId],
        references: [user._.columns.id],
    }),
    article: one(article, {
        fields: [userToArticle._.columns.articleId],
        references: [article._.columns.id],
    }),
}))

export const userToPaperRelations = relations(userToPaper, ({ one }) => ({
    user: one(user, {
        fields: [userToPaper._.columns.userId],
        references: [user._.columns.id],
    }),
    paper: one(paper, {
        fields: [userToPaper._.columns.paperId],
        references: [paper._.columns.id],
    }),
}))

// ─── Schema object for ORM ───────────────────────────────────────────────────

export const productionSchema = {
    user,
    userRelations,
    session,
    sessionRelations,
    account,
    accountRelations,
    article,
    articleRelations,
    userToArticle,
    userToArticleRelations,
    volume,
    volumeRelations,
    issue,
    issueRelations,
    paper,
    paperRelations,
    userToPaper,
    userToPaperRelations,
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createProductionOrm(
    dbPath: string
): { orm: TauriORM; db: MockDatabase } {
    const db = MockDatabase.open(dbPath)
    const orm = new TauriORM(db, productionSchema)
    return { orm, db }
}
