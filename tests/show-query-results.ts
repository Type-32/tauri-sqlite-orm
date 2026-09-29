/**
 * Run this to see query results from representative tests.
 * Usage: bun run tests/show-query-results.ts
 */

import { eq } from '../src/index'
import { createOrm, users, posts } from './helpers/schema'
import { createProductionOrm, paper } from './helpers/production-schema'
import { removeDb } from './helpers/mock-db'

const DB_PATH = 'show-results.db'
const PROD_DB = 'show-results-prod.db'

async function main() {
    removeDb(DB_PATH)
    removeDb(PROD_DB)

    console.log('═'.repeat(60))
    console.log('1. Basic schema: users with posts (one-to-many)')
    console.log('═'.repeat(60))

    const { orm, db } = createOrm(DB_PATH)
    await orm.migrate()
    await orm.insert(users).values([
        { name: 'Alice', email: 'a@x.com', age: 30, isActive: true, role: 'admin' },
        { name: 'Bob', email: 'b@x.com', age: 25, isActive: true, role: 'user' },
    ]).execute()
    const [alice] = await orm.select(users).where(eq(users._.columns.email, 'a@x.com')).all()
    await orm.insert(posts).values([
        { title: 'Post 1', content: 'c1', userId: alice!.id, views: 10, published: true },
        { title: 'Post 2', content: 'c2', userId: alice!.id, views: 20, published: false },
    ]).execute()

    const usersWithPosts = await orm.select(users).include({ posts: true }).all()
    console.log(JSON.stringify(usersWithPosts, null, 2))

    console.log('\n' + '═'.repeat(60))
    console.log('2. Basic schema: posts with user (many-to-one)')
    console.log('═'.repeat(60))

    const postsWithUser = await orm.select(posts).include({ user: true }).all()
    console.log(JSON.stringify(postsWithUser, null, 2))

    db.close()
    removeDb(DB_PATH)

    console.log('\n' + '═'.repeat(60))
    console.log('3. Production schema: paper with issue + volume (columns selected)')
    console.log('═'.repeat(60))

    const { orm: prodOrm, db: prodDb } = createProductionOrm(PROD_DB)
    const { volume, issue: issueTable } = await import('./helpers/production-schema')
    await prodOrm.migrate()
    const vol = await prodOrm.insert(volume).values({
        volumeNumber: 1,
        academicYearStart: 2024,
        academicYearEnd: 2025,
    }).returningFirst()
    const iss = await prodOrm.insert(issueTable).values({
        title: 'Issue 1',
        status: 'open',
        deadlineDate: new Date(),
        volumeId: vol!.id,
        issueNumber: 1,
    }).returningFirst()
    await prodOrm.insert(paper).values({
        title: 'My Paper',
        abstract: 'Abstract',
        keywords: ['a', 'b'],
        status: 'draft',
        submissionDate: new Date(),
        issueId: iss!.id,
    }).execute()

    const papersWithIssueAndVolume = await prodOrm.select(paper).include({
        issue: {
            columns: { id: true, title: true, issueNumber: true },
            with: {
                volume: {
                    columns: { id: true, volumeNumber: true, academicYearStart: true, academicYearEnd: true },
                },
            },
        },
    }).all()

    console.log(JSON.stringify(papersWithIssueAndVolume, (_, v) =>
        v instanceof Date ? v.toISOString() : v
    , 2))

    prodDb.close()
    removeDb(PROD_DB)

    console.log('\n' + '═'.repeat(60))
    console.log('4. Basic schema: posts with postTags + tag (many-to-many)')
    console.log('═'.repeat(60))

    removeDb('show-results-m2m.db')
    const { orm: orm2, db: db2 } = createOrm('show-results-m2m.db')
    await orm2.migrate()
    const { tags, postTags } = await import('./helpers/schema')
    await orm2.insert(users).values({ name: 'A', email: 'a@m2m.com', isActive: true, role: 'user' }).execute()
    const [u] = await orm2.select(users).where(eq(users._.columns.email, 'a@m2m.com')).all()
    await orm2.insert(posts).values({ title: 'P1', content: 'c', userId: u!.id, views: 0, published: true }).execute()
    const [p] = await orm2.select(posts).where(eq(posts._.columns.title, 'P1')).all()
    await orm2.insert(tags).values([{ name: 'js' }, { name: 'ts' }]).execute()
    const [t1, t2] = await orm2.select(tags).all()
    await orm2.insert(postTags).values([
        { postId: p!.id, tagId: t1!.id },
        { postId: p!.id, tagId: t2!.id },
    ]).execute()

    const postsWithTags = await orm2.select(posts)
        .include({ postTags: { with: { tag: true } } })
        .all()

    console.log(JSON.stringify(postsWithTags, null, 2))

    db2.close()
    removeDb('show-results-m2m.db')

    console.log('\nDone.')
}

main().catch(console.error)
