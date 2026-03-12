/**
 * Tests for production schema (Drizzle-adapted).
 * Validates migration, CRUD, relations, and column reference patterns.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from '../src/index'
import { createProductionOrm, user, session, account, article, userToArticle, volume, issue, paper, userToPaper } from './helpers/production-schema'
import { removeDb } from './helpers/mock-db'

const DB_PATH = 'production-schema-test.db'

let orm: ReturnType<typeof createProductionOrm>['orm']
let db: ReturnType<typeof createProductionOrm>['db']

beforeAll(async () => {
    removeDb(DB_PATH)
    ;({ orm, db } = createProductionOrm(DB_PATH))
    await orm.migrate()
})

afterAll(() => {
    db.close()
    removeDb(DB_PATH)
})

// ─── Migration & schema ─────────────────────────────────────────────────────

describe('Production schema — migration', () => {
    test('creates all tables', async () => {
        expect(await orm.doesTableExist('user')).toBe(true)
        expect(await orm.doesTableExist('session')).toBe(true)
        expect(await orm.doesTableExist('account')).toBe(true)
        expect(await orm.doesTableExist('article')).toBe(true)
        expect(await orm.doesTableExist('user_to_article')).toBe(true)
        expect(await orm.doesTableExist('volume')).toBe(true)
        expect(await orm.doesTableExist('issue')).toBe(true)
        expect(await orm.doesTableExist('paper')).toBe(true)
        expect(await orm.doesTableExist('user_to_paper')).toBe(true)
    })

    test('checkMigration reports no changes after migrate', async () => {
        const { safe, changes } = await orm.checkMigration()
        expect(safe).toBe(true)
        expect(changes.tablesToCreate).toHaveLength(0)
    })
})

// ─── User & session (one-to-many) ────────────────────────────────────────────

describe('Production schema — user & session', () => {
    test('insert user with text id and defaults', async () => {
        const u = await orm.insert(user)
            .values({
                id: 'usr_001',
                name: 'Alice',
                email: 'alice@example.com',
            })
            .returningFirst()
        expect(u).toBeDefined()
        expect(u!.id).toBe('usr_001')
        expect(u!.name).toBe('Alice')
        expect(u!.role).toBe('user')
        expect(u!.emailVerified).toBe(false)
        expect(u!.createdAt).toBeInstanceOf(Date)
        expect(u!.updatedAt).toBeInstanceOf(Date)
    })

    test('insert session referencing user', async () => {
        const s = await orm.insert(session)
            .values({
                id: 'sess_001',
                expiresAt: new Date(Date.now() + 86400000),
                token: 'tok_abc123',
                userId: 'usr_001',
            })
            .returningFirst()
        expect(s).toBeDefined()
        expect(s!.userId).toBe('usr_001')
    })

    test('session.include({ user }) loads user', async () => {
        const rows = await orm.select(session)
            .where(eq(session._.columns.id, 'sess_001', session._.name))
            .include({ user: true })
            .all()
        expect(rows).toHaveLength(1)
        expect((rows[0] as any).user).toBeDefined()
        expect((rows[0] as any).user.name).toBe('Alice')
    })

    test('user.include({ sessions }) loads sessions', async () => {
        const rows = await orm.select(user)
            .where(eq(user._.columns.id, 'usr_001', user._.name))
            .include({ sessions: true })
            .all()
        expect(rows).toHaveLength(1)
        expect((rows[0] as any).sessions).toHaveLength(1)
        expect((rows[0] as any).sessions[0].token).toBe('tok_abc123')
    })
})

// ─── Article & userToArticle (many-to-many via junction) ──────────────────────

describe('Production schema — article & userToArticle', () => {
    test('insert article with json tags and uuid id', async () => {
        const a = await orm.insert(article)
            .values({
                title: 'Test Article',
                slug: 'test-article',
                tags: ['tech', 'drizzle'],
            })
            .returningFirst()
        expect(a).toBeDefined()
        expect(a!.id).toBeDefined()
        expect(a!.tags).toEqual(['tech', 'drizzle'])
        expect(a!.published).toBe(false)
    })

    test('insert userToArticle junction', async () => {
        const [alice] = await orm.select(user).where(eq(user._.columns.email, 'alice@example.com')).all()
        const [art] = await orm.select(article).where(eq(article._.columns.slug, 'test-article')).all()
        await orm.insert(userToArticle).values({
            userId: alice.id,
            articleId: art.id,
            isCreator: true,
        }).execute()
        const rows = await orm.select(userToArticle).all()
        expect(rows.length).toBeGreaterThan(0)
    })
})

// ─── Volume, issue, paper (hierarchical) ──────────────────────────────────────

describe('Production schema — volume, issue, paper', () => {
    test('insert volume and issue', async () => {
        const v = await orm.insert(volume)
            .values({
                volumeNumber: 1,
                academicYearStart: 2024,
                academicYearEnd: 2025,
            })
            .returningFirst()
        expect(v).toBeDefined()
        expect(v!.id).toBeGreaterThan(0)

        const i = await orm.insert(issue)
            .values({
                title: 'Issue 1',
                status: 'open',
                deadlineDate: new Date(),
                volumeId: v!.id,
                issueNumber: 1,
            })
            .returningFirst()
        expect(i).toBeDefined()
    })

    test('insert paper with issue reference', async () => {
        const [issueRow] = await orm.select(issue).where(eq(issue._.columns.title, 'Issue 1')).all()
        const p = await orm.insert(paper)
            .values({
                title: 'My Paper',
                abstract: 'An abstract',
                keywords: ['orm', 'sqlite'],
                status: 'draft',
                submissionDate: new Date(),
                issueId: issueRow.id,
            })
            .returningFirst()
        expect(p).toBeDefined()
        expect(p!.issueId).toBe(issueRow.id)
    })

    test('paper.include({ issue }) loads issue', async () => {
        const rows = await orm.select(paper)
            .include({ issue: true })
            .all()
        expect(rows.length).toBeGreaterThan(0)
        const p = rows.find((r: any) => r.title === 'My Paper') as any
        expect(p).toBeDefined()
        expect(p.issue).toBeDefined()
        expect(p.issue.title).toBe('Issue 1')
    })

    test('issue.include({ volume }) loads volume', async () => {
        const rows = await orm.select(issue)
            .include({ volume: true })
            .all()
        expect(rows.length).toBeGreaterThan(0)
        const i = rows[0] as any
        expect(i.volume).toBeDefined()
        expect(i.volume.volumeNumber).toBe(1)
    })
})

// ─── Column selection in includes (extreme examples) ──────────────────────────

describe('Column selection in includes', () => {
    test('include with columns (array) selects only specified columns', async () => {
        const rows = await orm.select(paper)
            .include({ issue: { columns: ['id', 'title', 'issueNumber'] } })
            .all()
        const p = rows.find((r: any) => r.title === 'My Paper') as any
        expect(p).toBeDefined()
        expect(p.issue).toBeDefined()
        expect(p.issue.id).toBeDefined()
        expect(p.issue.title).toBe('Issue 1')
        expect(p.issue.issueNumber).toBe(1)
        expect(p.issue.description).toBeUndefined()
        expect(p.issue.status).toBeUndefined()
    })

    test('include with columns (object) selects only specified columns', async () => {
        const rows = await orm.select(paper)
            .include({ issue: { columns: { id: true, title: true, issueNumber: true } } })
            .all()
        const p = rows.find((r: any) => r.title === 'My Paper') as any
        expect(p).toBeDefined()
        expect(p.issue.id).toBeDefined()
        expect(p.issue.title).toBe('Issue 1')
        expect(p.issue.issueNumber).toBe(1)
        expect(p.issue.volumeId).toBeUndefined()
    })

    test('nested with columns: paper.include({ issue: { columns, with: { volume: { columns } } } })', async () => {
        const rows = await orm.select(paper)
            .include({
                issue: {
                    columns: { id: true, title: true, issueNumber: true },
                    with: {
                        volume: {
                            columns: { id: true, volumeNumber: true, academicYearStart: true, academicYearEnd: true },
                        },
                    },
                },
            })
            .all()
        const p = rows.find((r: any) => r.title === 'My Paper') as any
        expect(p).toBeDefined()
        expect(p.issue).toBeDefined()
        expect(p.issue.id).toBeDefined()
        expect(p.issue.title).toBe('Issue 1')
        expect(p.issue.issueNumber).toBe(1)
        expect(p.issue.volume).toBeDefined()
        expect(p.issue.volume.id).toBeDefined()
        expect(p.issue.volume.volumeNumber).toBe(1)
        expect(p.issue.volume.academicYearStart).toBe(2024)
        expect(p.issue.volume.academicYearEnd).toBe(2025)
        expect(p.issue.volume.publishedDate).toBeUndefined()
        expect(p.issue.volume.createdAt).toBeUndefined()
    })

    test('many relation with columns: user.include({ sessions: { columns: [\'id\', \'token\'] } })', async () => {
        const rows = await orm.select(user)
            .where(eq(user._.columns.id, 'usr_001', user._.name))
            .include({ sessions: { columns: ['id', 'token'] } })
            .all()
        expect(rows).toHaveLength(1)
        const u = rows[0] as any
        expect(u.sessions).toHaveLength(1)
        expect(u.sessions[0].id).toBe('sess_001')
        expect(u.sessions[0].token).toBe('tok_abc123')
        expect(u.sessions[0].expiresAt).toBeUndefined()
    })
})
