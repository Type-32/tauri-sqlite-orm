import { sqliteTable, integer, text, InferSelectModel } from './src/index'

const messages = sqliteTable('messages', {
    id: integer('id').unique().primaryKey().autoincrement(),
    text: text('text').notNull(),
    conversationId: text('conversationId'),
    senderId: text('senderId'),
})

type SelectMessage = InferSelectModel<typeof messages>

// Hover over these - they should NOW show correct types!
type Test1 = SelectMessage['conversationId']  // Should be: string | null ✅
type Test2 = SelectMessage['senderId']        // Should be: string | null ✅
type Test3 = SelectMessage['id']              // Should be: number ✅
type Test4 = SelectMessage['text']            // Should be: string ✅

// Let me also verify the column types are correct now
type DirectConvId = typeof messages._.columns.conversationId
// Should be: SQLiteColumn<"conversationId", "TEXT", "default", false, false, false, never, never> ✅

type ExtractedConvId = import('./src/types').ExtractColumnType<typeof messages._.columns.conversationId>
// Should be: string | null ✅

// Test with timestamp mode
const withTimestamp = sqliteTable('test', {
    createdAt: integer('createdAt', { mode: "timestamp" }),
})
type TimestampType = InferSelectModel<typeof withTimestamp>['createdAt']
// Should be: Date | null ✅
