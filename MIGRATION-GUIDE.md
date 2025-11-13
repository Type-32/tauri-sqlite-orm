# Migration System Guide

## ✅ Fixed Migration Issues

The migration system now properly handles SQLite's ALTER TABLE limitations by automatically recreating tables when needed.

### What's Fixed

1. **✅ Adding UNIQUE constraints** to existing columns
2. **✅ Modifying column types** (e.g., TEXT → INTEGER)
3. **✅ Changing NOT NULL constraints**
4. **✅ Adding/removing PRIMARY KEY**
5. **✅ Adding columns with constraints** that can't be added via ALTER TABLE
6. **✅ Removing columns** (with `performDestructiveActions: true`)

### How It Works

The migration system now uses two strategies:

#### Strategy 1: Simple ALTER TABLE (Fast)
Used when adding new nullable columns with no constraints:
```typescript
// This can be added with ALTER TABLE
userId: text('userId')  // New nullable column
```

#### Strategy 2: Table Recreation (Safe)
Used when column definitions change or constraints are added:
```typescript
// These require table recreation:
email: text('email').unique()  // Adding UNIQUE to existing column
age: integer('age')            // Changing type
name: text('name').notNull()   // Adding NOT NULL
```

**Table Recreation Steps:**
1. Create temporary table with new schema
2. Copy all data from old table (preserving existing columns)
3. Drop old table
4. Rename temporary table to original name

### Usage

```typescript
import Database from '@tauri-apps/plugin-sql'
import { TauriORM, sqliteTable, integer, text } from '@type32/tauri-sqlite-orm'

const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  email: text('email').unique(),  // ← Can now add UNIQUE to existing column!
})

const db = await Database.load('sqlite:mydb.db')
const orm = new TauriORM(db, { users })

// Automatically detects and applies schema changes
await orm.migrate()

// Or use auto-migration
await orm.migrateIfDirty()  // Only migrates if schema changed
```

### Migration Options

```typescript
// Default: Safe mode (only adds columns, never removes)
await orm.migrate()

// Destructive mode: Also removes tables/columns not in schema
await orm.migrate({ performDestructiveActions: true })
```

### What Gets Detected

The migration system detects these changes:
- ✅ New tables
- ✅ New columns
- ✅ Removed columns (destructive mode only)
- ✅ Column type changes (TEXT, INTEGER, etc.)
- ✅ NOT NULL constraint changes
- ✅ UNIQUE constraint changes
- ✅ PRIMARY KEY changes
- ✅ DEFAULT value changes
- ✅ Removed tables (destructive mode only)

### Examples

#### Example 1: Adding UNIQUE constraint
```typescript
// Before migration
const users = sqliteTable('users', {
  email: text('email'),  // No constraint
})

// After adding UNIQUE
const users = sqliteTable('users', {
  email: text('email').unique(),  // ← Added UNIQUE
})

// Migration will recreate the table with the UNIQUE constraint
await orm.migrate()  // ✅ Works now!
```

#### Example 2: Changing column type
```typescript
// Before
const posts = sqliteTable('posts', {
  views: text('views'),  // Was TEXT
})

// After
const posts = sqliteTable('posts', {
  views: integer('views'),  // Changed to INTEGER
})

await orm.migrate()  // ✅ Recreates table
```

#### Example 3: Adding NOT NULL
```typescript
// Before
const users = sqliteTable('users', {
  name: text('name'),  // Nullable
})

// After
const users = sqliteTable('users', {
  name: text('name').notNull(),  // ← Added NOT NULL
})

await orm.migrate()  // ✅ Recreates table
```

### Safety Features

- **Data Preservation**: All existing data is copied during table recreation
- **Column Mapping**: Only common columns are copied (new columns get NULL/default values)
- **Transaction Safety**: Use within `orm.transaction()` for atomic migrations
- **Schema Tracking**: Uses `_schema_meta` table to track changes

### Performance

- **Simple additions**: Fast (uses ALTER TABLE)
- **Schema changes**: Slower (recreates table) but safe
- **Large tables**: Consider using manual migrations for tables with millions of rows

### Manual Migration Control

For complex scenarios, you can still use manual migration helpers:

```typescript
// Check if schema changed
const { dirty, current, stored } = await orm.isSchemaDirty()
if (dirty) {
  console.log('Schema changed, need to migrate')
}

// Manual table operations
await orm.dropTable('old_table')
await orm.renameTable('old', 'new')
await orm.renameColumn('users', 'email', 'email_address')
```

## Troubleshooting

### Issue: Data loss during migration
**Solution**: Always back up your database before running migrations with `performDestructiveActions: true`

### Issue: Migration fails on large tables
**Solution**: For tables with millions of rows, consider creating custom migration scripts

### Issue: Foreign key constraint errors
**Solution**: Ensure referenced tables are migrated first (migration order matters)

---

**Note**: This file can be deleted after reading. It's for documentation purposes only.

