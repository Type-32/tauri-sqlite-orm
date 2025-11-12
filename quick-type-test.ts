import { sqliteTable, integer, text, InferSelectModel } from './src/index'

const messages = sqliteTable('messages', {
    id: integer('id').unique().primaryKey().autoincrement(),
    text: text('text').notNull(),
    conversationId: text('conversationId'),
    senderId: text('senderId'),
})

type SelectMessage = InferSelectModel<typeof messages>

// Hover over these - they should NOW show correct types!
type Test1 = SelectMessage['conversationId']  // ✅ string | null
type Test2 = SelectMessage['senderId']        // ✅ string | null
type Test3 = SelectMessage['id']              // ✅ number
type Test4 = SelectMessage['text']            // ✅ string

// Let me also verify the column types are correct now
type DirectConvId = typeof messages._.columns.conversationId
// ✅ SQLiteColumn<"conversationId", "TEXT", "default", false, false, false, never, never>

type ExtractedConvId = import('./src/types').ExtractColumnType<typeof messages._.columns.conversationId>
// ✅ string | null

// Test with timestamp mode - SHOULD NOW BE FIXED!
const withTimestamp = sqliteTable('test', {
    createdAt: integer('createdAt', { mode: "timestamp" }),
})
type TimestampType = InferSelectModel<typeof withTimestamp>['createdAt']
// ✅ Should NOW be: Date | null (not number | boolean | Date | null)

// Test different integer modes
const allModes = sqliteTable('modes', {
    normal: integer('normal'),                              // number | null
    timestamp: integer('timestamp', { mode: 'timestamp' }), // Date | null
    timestampMs: integer('timestampMs', { mode: 'timestamp_ms' }), // Date | null
    bool: integer('bool', { mode: 'boolean' }),            // boolean | null
    bigint: integer('bigint', { mode: 'bigint' }),         // bigint | null
})

type Modes = InferSelectModel<typeof allModes>
type NormalMode = Modes['normal']       // ✅ number | null
type TimestampMode = Modes['timestamp'] // ✅ Date | null (FIXED!)
type TimestampMsMode = Modes['timestampMs'] // ✅ Date | null (FIXED!)
type BoolMode = Modes['bool']           // ✅ boolean | null (FIXED!)
type BigintMode = Modes['bigint']       // ✅ bigint | null
