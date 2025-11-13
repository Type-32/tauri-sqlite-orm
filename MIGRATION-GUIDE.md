# Migration System - Fixed!

## ✅ What Was Fixed

### 1. **SQLite ALTER TABLE Limitations**
Previously, the migration tried to add UNIQUE constraints using `ALTER TABLE ADD COLUMN`, which SQLite doesn't support.

**Fixed:** The migration now detects when table recreation is needed and automatically handles it.

### 2. **Smart Table Recreation**
When you add constraints like UNIQUE, PRIMARY KEY, or FOREIGN KEY to existing columns or new columns, the ORM now:
1. Creates a new temporary table with the correct schema
2. Copies all data from the old table
3. Drops the old table
4. Renames the new table

### 3. **Better Logging**
Migration operations are now logged so you can see what's happening.

## 🚀 Usage

### Basic Migration

```typescript
import Database from '@tauri-apps/plugin-sql'
import { TauriORM, sqliteTable, integer, text } from '@type32/tauri-sqlite-orm'

const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(), // ← Adding .unique() will trigger table recreation
})

const db = await Database.load('sqlite:mydb.db')
const orm = new TauriORM(db, { users })

// Run migration with logging
await orm.migrate({ logging: true })
```

### Migration with Options

```typescript
// Enable logging (default: true)
await orm.migrate({ 
  logging: true  // Shows what's happening
})

// Disable logging
await orm.migrate({ 
  logging: false 
})

// Enable destructive actions (dropping columns/tables)
await orm.migrate({ 
  performDestructiveActions: true,
  logging: true
})

// Auto-migrate only when schema changes
await orm.migrateIfDirty({ logging: true })
```

## 📋 When Table Recreation is Triggered

The ORM will **automatically recreate the table** when:

1. **Adding constraints to new columns:**
   - `.unique()`
   - `.primaryKey()`
   - `.references()` (foreign keys)
   - `.notNull()` without a default value

2. **Modifying existing columns:**
   - Changing column type
   - Adding/removing PRIMARY KEY
   - Adding UNIQUE constraint

3. **Examples:**

```typescript
// ✅ Safe - can use ALTER TABLE ADD COLUMN
const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name'),                    // Nullable, no constraints
  age: integer('age').default(0),        // Has default
})

// ⚠️ Requires table recreation
const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),          // NOT NULL without default
  email: text('email').unique(),         // UNIQUE constraint
  userId: integer('user_id').references(otherTable, 'id'), // Foreign key
})
```

## 🔄 Migration Process

### Simple Changes (ALTER TABLE)
```
[Tauri-ORM Migration] Adding column: users.age
```

### Complex Changes (Table Recreation)
```
[Tauri-ORM Migration] Recreating table users (complex schema changes detected)
```

The recreation process:
1. Creates `users_new_1234567890` with correct schema
2. Copies data: `INSERT INTO users_new_1234567890 SELECT ... FROM users`
3. Drops old table: `DROP TABLE users`
4. Renames: `ALTER TABLE users_new_1234567890 RENAME TO users`

## ⚠️ Important Notes

1. **Data Preservation:** Table recreation preserves all data for columns that exist in both old and new schemas

2. **Dropped Columns:** If you remove a column from your schema, it will only be dropped if you use `performDestructiveActions: true`

3. **$defaultFn Functions:** Runtime default functions (like `$defaultFn(() => new Date())`) are NOT applied during migration - they only work on INSERT operations

4. **Backup Recommended:** Always backup your database before running migrations with `performDestructiveActions: true`

## 🐛 Your Bug - Fixed!

### Your Issue:
```typescript
// You had this column without .unique()
conversationId: text('conversationId'),

// Then changed it to:
conversationId: text('conversationId').unique(),

// Migration tried: ALTER TABLE ADD COLUMN ... UNIQUE
// Error: "Cannot add a UNIQUE column"
```

### The Fix:
The ORM now detects that `.unique()` was added and **recreates the table** instead of using ALTER TABLE:

```typescript
await orm.migrate({ logging: true })
// Output: [Tauri-ORM Migration] Recreating table messages (complex schema changes detected)
```

## 📝 Example Migration Flow

```typescript
import Database from '@tauri-apps/plugin-sql'
import { TauriORM, sqliteTable, integer, text } from '@type32/tauri-sqlite-orm'

// Initial schema
const messages = sqliteTable('messages', {
  id: integer('id').primaryKey().autoincrement(),
  text: text('text').notNull(),
  conversationId: text('conversationId'), // No constraints
})

const db = await Database.load('sqlite:app.db')
const orm = new TauriORM(db, { messages })
await orm.migrate({ logging: true })
// Output: [Tauri-ORM Migration] Creating table: messages

// Later, you add .unique()
const messages = sqliteTable('messages', {
  id: integer('id').primaryKey().autoincrement(),
  text: text('text').notNull(),
  conversationId: text('conversationId').unique(), // ← Added constraint
})

const orm2 = new TauriORM(db, { messages })
await orm2.migrate({ logging: true })
// Output: [Tauri-ORM Migration] Recreating table messages (complex schema changes detected)
// ✅ Your data is preserved!
```

## 🎯 Testing Your Fix

Try running your migration again - it should work now! [[memory:11105180]]

```bash
bun run your-migration-script.ts
```

You should see:
```
[Tauri-ORM Migration] Recreating table messages (complex schema changes detected)
```

And no more "Cannot add a UNIQUE column" error!

