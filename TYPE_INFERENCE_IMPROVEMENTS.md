# Type Inference Improvements

## Summary of Changes

The type inference system has been completely overhauled to provide accurate, strict TypeScript types throughout the ORM. **No more `any` types leaking through!**

## Key Improvements

### 1. **Proper Null Handling**

Columns now correctly reflect their nullability:

```typescript
const users = sqliteTable('users', {
    name: text('name').notNull(),      // Type: string
    bio: text('bio'),                   // Type: string | null
})

type User = InferSelectModel<typeof users>
// {
//   name: string         ✅ Non-nullable
//   bio: string | null   ✅ Nullable
// }
```

### 2. **No More `any` Types**

**Before:**
- JSON columns were typed as `any`
- Many internal types used `any`

**After:**
- JSON columns use `unknown` by default, requiring explicit typing with `.$type<T>()`
- All types are properly inferred
- Custom types are fully respected

```typescript
// ❌ OLD: Returns any
metadata: text('metadata', { mode: 'json' })

// ✅ NEW: Must use $type for proper typing
metadata: text('metadata', { mode: 'json' })
    .$type<{ theme: string; notifications: boolean }>()

// Result: Type is { theme: string; notifications: boolean } | null
```

### 3. **Smart Insert vs Select Types**

**SELECT Model** (`InferSelectModel`):
- All columns are present
- Respects `notNull` constraints
- Includes `null` for nullable columns

**INSERT Model** (`InferInsertModel`):
- Required fields: columns that are `notNull` AND have no default/autoincrement
- Optional fields: columns with defaults, `$defaultFn`, autoincrement, or nullable

```typescript
const users = sqliteTable('users', {
    id: integer('id').primaryKey().autoincrement(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    bio: text('bio'),                           // nullable
    role: text('role').notNull().default('user'), // has default
    createdAt: integer('createdAt', { mode: 'timestamp' })
        .notNull().$defaultFn(() => new Date()),
})

type UserInsert = InferInsertModel<typeof users>
// {
//   email: string      ✅ Required (notNull, no default)
//   name: string       ✅ Required (notNull, no default)
//   bio?: string | null    ✅ Optional (nullable)
//   role?: string          ✅ Optional (has default)
//   createdAt?: Date       ✅ Optional (has $defaultFn)
//   id?: number            ✅ Optional (autoincrement)
// }

type UserSelect = InferSelectModel<typeof users>
// {
//   id: number         ✅ Non-null
//   email: string      ✅ Non-null
//   name: string       ✅ Non-null
//   bio: string | null ✅ Nullable
//   role: string       ✅ Non-null (has default)
//   createdAt: Date    ✅ Non-null
// }
```

### 4. **Enum Type Support**

Enum columns now properly type-check:

```typescript
const posts = sqliteTable('posts', {
    status: text('status').notNull().$type<'draft' | 'published' | 'archived'>(),
})

type Post = InferSelectModel<typeof posts>
// { status: 'draft' | 'published' | 'archived' }
```

### 5. **Custom Type Preservation**

Custom types set via `.$type<T>()` are now properly preserved and respected:

```typescript
interface UserMetadata {
    theme: 'light' | 'dark'
    notifications: boolean
    preferences: {
        language: string
        timezone: string
    }
}

const users = sqliteTable('users', {
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$type<UserMetadata>(),
})

type User = InferSelectModel<typeof users>
// { metadata: UserMetadata } ✅ Fully typed, not 'any'!
```

## Type Safety in Action

### Query Results

```typescript
// INSERT
const user = await db.insert(users)
    .values({
        email: 'test@example.com',
        name: 'John Doe',
        // All optional fields can be omitted
    })
    .returningFirst()

// user is typed as: InferSelectModel<typeof users> | undefined
if (user) {
    user.email   // ✅ string
    user.bio     // ✅ string | null
    user.role    // ✅ string
    // user.invalid // ❌ TypeScript error!
}

// SELECT
const users = await db.select(users).all()
// users is typed as: InferSelectModel<typeof users>[]

// UPDATE
const updated = await db.update(users)
    .set({ name: 'Jane Doe' })
    .where(eq(users._.columns.id, 1))
    .returningFirst()
// updated is typed as: InferSelectModel<typeof users> | undefined
```

### Type Errors Caught at Compile Time

```typescript
// ❌ TypeScript error: Missing required field
const invalid1: InferInsertModel<typeof users> = {
    name: 'John Doe',
    // Missing 'email' - compile error!
}

// ❌ TypeScript error: Cannot assign null to notNull field
const invalid2: InferSelectModel<typeof users> = {
    email: null, // email is notNull - compile error!
    // ...
}

// ❌ TypeScript error: Wrong custom type shape
const invalid3: InferInsertModel<typeof users> = {
    email: 'test@example.com',
    name: 'John Doe',
    metadata: { wrongField: 'value' }, // compile error!
}
```

## Technical Details

### Type Extraction Logic

The `ExtractColumnType` type now uses a clear, hierarchical approach:

1. **Check for custom type** (from `.$type<T>()`)
   - If present, use it and respect `notNull`
2. **Check for enum type**
   - If present, create union type and respect `notNull`
3. **Fall back to column data type**
   - Map SQL type to TypeScript type
   - Respect `notNull` constraint
   - Add `| null` for nullable columns

### Column Type Mapping

| SQL Type | Mode | TypeScript Type |
|----------|------|-----------------|
| TEXT | default | `string` |
| TEXT | json | `unknown` (use `.$type<T>()`) |
| INTEGER | default | `number` |
| INTEGER | timestamp | `Date` |
| INTEGER | boolean | `boolean` |
| REAL | - | `number` |
| BOOLEAN | - | `boolean` |
| BLOB | default | `Uint8Array` |
| BLOB | bigint | `bigint` |

### Insert Model Logic

A column is **optional** in `InferInsertModel` if:
- It has `.autoincrement()` (primary keys), OR
- It has `.default()` or `.$defaultFn()`, OR
- It is nullable (`notNull` is false)

Otherwise, it is **required**.

## Migration Guide

If you have existing code:

### 1. JSON Columns

**Before:**
```typescript
metadata: text('metadata', { mode: 'json' })
// Type: any
```

**After:**
```typescript
metadata: text('metadata', { mode: 'json' })
    .$type<{ theme: string }>()
// Type: { theme: string } | null
```

### 2. Nullable vs Non-Nullable

Make sure your schema accurately reflects your database constraints:

```typescript
// If the column can be NULL in the database
bio: text('bio')                    // ✅ Correct: string | null

// If the column is NOT NULL in the database
email: text('email').notNull()      // ✅ Correct: string
```

### 3. Insert Operations

Required fields in INSERT must now be provided (unless they have defaults):

```typescript
// ❌ This will now error if 'email' is required
await db.insert(users).values({
    name: 'John',
    // Missing email
})

// ✅ Correct
await db.insert(users).values({
    email: 'john@example.com',
    name: 'John',
})
```

## Benefits

✅ **Catch errors at compile time** instead of runtime  
✅ **Better IDE autocomplete** with accurate types  
✅ **Self-documenting code** - types show what's required  
✅ **Refactoring confidence** - TypeScript will catch breaking changes  
✅ **No more `any`** - strict type safety throughout  

## Testing Your Types

Use the included `type-test-visual.ts` file to verify types in your IDE:

```bash
# View the file and hover over variables to inspect types
code type-test-visual.ts
```

Look for:
- Correct nullable types (`string | null` vs `string`)
- Proper custom types (no `any` or `unknown` where you used `.$type<T>()`)
- Required vs optional fields in `InferInsertModel`

---

**Result:** Your ORM now has production-grade TypeScript types that accurately reflect your database schema! 🎉

