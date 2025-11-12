// Quick type verification - DELETE THIS FILE after checking
import { sqliteTable, integer, text } from './src/column-helpers'
import type { InferSelectModel, InferInsertModel } from './src/orm'

const messages = sqliteTable('messages', {
    id: integer('id').unique().primaryKey().autoincrement(),
    text: text('text').notNull(),
    conversationId: text('conversationId'),
    senderId: text('senderId'),
    createdAt: integer('createdAt', { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: "timestamp" }).$defaultFn(() => new Date()),
})

type Select = InferSelectModel<typeof messages>
type Insert = InferInsertModel<typeof messages>

// Type tests - these should compile without errors
const _selectTest: Select = {
    id: 1,
    text: 'hi',
    conversationId: 'test',  // Should be string | null
    senderId: null,          // Should be string | null
    createdAt: new Date(),   // Should be Date | null
    updatedAt: null,         // Should be Date | null
}

const _insertTest: Insert = {
    text: 'required',        // Only required field
    conversationId: 'id',    // Should be string | null | undefined
    senderId: null,          // Should be string | null | undefined
}

// Verify exact types (hover over these in your IDE)
type ID = Select['id']                        // Should be: number
type Text = Select['text']                    // Should be: string
type ConvId = Select['conversationId']        // Should be: string | null
type SenderId = Select['senderId']            // Should be: string | null
type CreatedAt = Select['createdAt']          // Should be: Date | null

