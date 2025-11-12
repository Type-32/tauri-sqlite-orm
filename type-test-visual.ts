// Visual Type Test - Use your IDE to inspect these types
// Hover over the variables to see their inferred types

import { sqliteTable, integer, text, boolean, InferSelectModel, InferInsertModel, TauriORM } from './src/index'
import Database from '@tauri-apps/plugin-sql'

// Define a realistic schema
const users = sqliteTable('users', {
    id: integer('id').primaryKey().autoincrement(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    bio: text('bio'), // nullable
    age: integer('age'), // nullable
    isActive: boolean('is_active').notNull().default(true),
    role: text('role').notNull().default('user'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$onUpdateFn(() => new Date()),
    metadata: text('metadata', { mode: 'json' }).$type<{ theme: string; notifications: boolean }>(),
    settings: text('settings', { mode: 'json' }).notNull().$type<{ language: string }>(),
})

// ==================== SELECT MODEL TEST ====================
type UserSelect = InferSelectModel<typeof users>

// Hover over this to see the inferred type
const userFromDb: UserSelect = {
    id: 1,
    email: 'test@example.com',
    name: 'John Doe',
    bio: null, // ✅ Should be: string | null
    age: null, // ✅ Should be: number | null
    isActive: true, // ✅ Should be: boolean (non-null)
    role: 'admin', // ✅ Should be: string (non-null)
    createdAt: new Date(), // ✅ Should be: Date (non-null)
    updatedAt: null, // ✅ Should be: Date | null
    metadata: null, // ✅ Should be: { theme: string; notifications: boolean } | null
    settings: { language: 'en' }, // ✅ Should be: { language: string } (non-null)
}

// Test that we can't assign undefined to notNull fields
// @ts-expect-error - Should error: isActive is notNull
const invalidUser1: UserSelect = {
    ...userFromDb,
    isActive: undefined,
}

// @ts-expect-error - Should error: email is notNull
const invalidUser2: UserSelect = {
    ...userFromDb,
    email: null,
}

// ==================== INSERT MODEL TEST ====================
type UserInsert = InferInsertModel<typeof users>

// Hover over this to see the inferred type
const userToInsert: UserInsert = {
    email: 'new@example.com', // Required
    name: 'Jane Doe', // Required
    settings: { language: 'fr' }, // Required (notNull with no default)
    // All other fields are optional:
    // - id: autoincrement
    // - bio: nullable
    // - age: nullable
    // - isActive: has default
    // - role: has default
    // - createdAt: has $defaultFn
    // - updatedAt: nullable
    // - metadata: nullable
}

// Test optional fields
const userToInsert2: UserInsert = {
    email: 'another@example.com',
    name: 'Bob Smith',
    settings: { language: 'es' },
    bio: 'A short bio', // Can be provided
    age: 30, // Can be provided
    isActive: false, // Can override default
    metadata: { theme: 'dark', notifications: true }, // Can be provided with proper type
}

// @ts-expect-error - Should error: Missing required field 'email'
const invalidInsert1: UserInsert = {
    name: 'Missing Email',
    settings: { language: 'en' },
}

// @ts-expect-error - Should error: Wrong type for metadata
const invalidInsert2: UserInsert = {
    email: 'test@test.com',
    name: 'Wrong Metadata',
    settings: { language: 'en' },
    metadata: { wrong: 'shape' },
}

// @ts-expect-error - Should error: Wrong type for settings
const invalidInsert3: UserInsert = {
    email: 'test@test.com',
    name: 'Wrong Settings',
    settings: { wrongField: 'value' },
}

// ==================== RUNTIME TYPE TEST ====================

async function runtimeTypeTest() {
    const db = await Database.load('sqlite:test.db')
    const orm = new TauriORM(db, { users })
    
    // Insert a user
    const inserted = await orm.insert(users)
        .values({
            email: 'runtime@test.com',
            name: 'Runtime Test',
            settings: { language: 'en' },
        })
        .returningFirst()
    
    // Hover over 'inserted' - should be UserSelect | undefined
    if (inserted) {
        // These should all be properly typed:
        const id: number = inserted.id
        const email: string = inserted.email
        const bio: string | null = inserted.bio
        const metadata: { theme: string; notifications: boolean } | null = inserted.metadata
        const settings: { language: string } = inserted.settings
        
        console.log({ id, email, bio, metadata, settings })
    }
    
    // Select a user
    const selected = await orm.select(users).where(/* condition */).get()
    
    // Hover over 'selected' - should be UserSelect | undefined
    if (selected) {
        // @ts-expect-error - bio can be null
        const nonNullBio: string = selected.bio
        
        // ✅ Correct usage
        const nullableBio: string | null = selected.bio
    }
    
    // Update a user
    const updated = await orm.update(users)
        .set({
            name: 'Updated Name',
            bio: 'New bio',
        })
        .where(/* condition */)
        .returningFirst()
    
    // Hover over 'updated' - should be UserSelect | undefined
}

console.log('✅ Type inference test complete!')
console.log('Inspect the types in your IDE to verify they are correct.')
console.log('')
console.log('Expected types:')
console.log('- UserSelect.id: number')
console.log('- UserSelect.email: string')
console.log('- UserSelect.bio: string | null')
console.log('- UserSelect.metadata: { theme: string; notifications: boolean } | null')
console.log('- UserSelect.settings: { language: string }')
console.log('')
console.log('- UserInsert: email, name, and settings are required; all others optional')

