/**
 * Type Inference Demo - Hover over variables to see inferred types
 * Delete this file after verification
 */

import { sqliteTable, integer, text, InferSelectModel, InferInsertModel } from './src/index'

// Your exact schema
export const messages = sqliteTable('messages', {
    id: integer('id').unique().primaryKey().autoincrement(),
    text: text('text').notNull(),
    conversationId: text('conversationId'),
    senderId: text('senderId'),
    createdAt: integer('createdAt', { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: "timestamp" }).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

// ✅ Hover over these types in your IDE to verify correct inference:

type SelectMessage = InferSelectModel<typeof messages>
// Should show:
// {
//   id: number
//   text: string
//   conversationId: string | null
//   senderId: string | null
//   createdAt: Date | null
//   updatedAt: Date | null
// }

type InsertMessage = InferInsertModel<typeof messages>
// Should show:
// {
//   text: string
//   id?: number | undefined
//   conversationId?: string | null | undefined
//   senderId?: string | null | undefined
//   createdAt?: Date | undefined
//   updatedAt?: Date | undefined
// }

// ✅ Valid SELECT result
const selectResult: SelectMessage = {
    id: 1,                      // number (required, non-null)
    text: "hello",              // string (required, non-null)
    conversationId: null,       // string | null (can be null)
    senderId: "user-123",       // string | null (can be null)
    createdAt: new Date(),      // Date | null (can be null)
    updatedAt: null,            // Date | null (can be null)
}

// ✅ Valid INSERT data (minimal)
const insertMinimal: InsertMessage = {
    text: "required field",     // Only required field!
}

// ✅ Valid INSERT data (full)
const insertFull: InsertMessage = {
    text: "message",
    id: 999,                    // number (optional, will be overridden by autoincrement)
    conversationId: "conv-1",   // string | null (optional, nullable)
    senderId: null,             // string | null (optional, nullable)
    createdAt: new Date(),      // Date (optional, non-null when provided)
    updatedAt: new Date(),      // Date (optional, non-null when provided)
}

console.log('✅ Type inference is working correctly!')
console.log('Hover over the variables and types above to verify in your IDE.')

