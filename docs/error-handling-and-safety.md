# Error Handling and Safety Features

This guide covers error handling, WHERE clause validation, and increment/decrement helpers for safe database operations.

## Table of Contents
- [Custom Error Classes](#custom-error-classes)
- [WHERE Clause Validation](#where-clause-validation)
- [Increment/Decrement Helpers](#incrementdecrement-helpers)
- [Best Practices](#best-practices)

## Custom Error Classes

The ORM provides specific error classes to help you handle different types of errors appropriately.

### Available Error Classes

```typescript
import {
  TauriORMError,              // Base error class
  QueryBuilderError,          // Query building errors
  MissingWhereClauseError,    // Missing WHERE in UPDATE/DELETE
  ValidationError,            // General validation errors
  InsertValidationError,      // Insert-specific validation
  UpdateValidationError,      // Update-specific validation
  MigrationError,             // Migration errors
  RelationError,              // Relation errors
  ColumnNotFoundError,        // Column doesn't exist
  TableNotFoundError,         // Table doesn't exist
} from '@type32/tauri-sqlite-orm'
```

### Error Hierarchy

```
TauriORMError (base)
├── QueryBuilderError
│   └── MissingWhereClauseError
├── ValidationError
│   ├── InsertValidationError
│   └── UpdateValidationError
├── MigrationError
├── RelationError
├── ColumnNotFoundError
└── TableNotFoundError
```

### Using Error Classes

```typescript
import { MissingWhereClauseError, ColumnNotFoundError } from '@type32/tauri-sqlite-orm'

try {
  // This will throw MissingWhereClauseError
  await orm.update(users).set({ name: 'Bob' }).execute()
} catch (error) {
  if (error instanceof MissingWhereClauseError) {
    console.error('Forgot WHERE clause:', error.message)
    // Handle missing WHERE clause specifically
  } else {
    throw error
  }
}

try {
  // This will throw ColumnNotFoundError
  await orm.update(users)
    .increment('nonExistentColumn' as any, 1)
    .execute()
} catch (error) {
  if (error instanceof ColumnNotFoundError) {
    console.error('Column not found:', error.message)
  }
}
```

### Error Messages

All errors provide clear, actionable messages:

```typescript
// MissingWhereClauseError
"UPDATE operation on table \"users\" requires a WHERE clause to prevent accidental data loss. 
Use .where() to specify conditions, or use .allowGlobalOperation() to explicitly allow operations without WHERE."

// ColumnNotFoundError
"Column \"age\" does not exist on table \"users\""

// InsertValidationError
"No data provided for insert. Use .values() to provide data."

// UpdateValidationError
"Cannot execute an update query without a .set(), .increment(), or .decrement() call."
```

## WHERE Clause Validation

**Critical Safety Feature**: UPDATE and DELETE operations require a WHERE clause by default to prevent accidental data loss.

### The Problem

Without validation, it's easy to accidentally update or delete all rows:

```typescript
// DANGEROUS: Accidentally updates ALL users!
await orm.update(users).set({ isActive: false }).execute()

// DANGEROUS: Accidentally deletes ALL posts!
await orm.delete(posts).execute()
```

### The Solution

The ORM now requires WHERE clauses for UPDATE and DELETE:

```typescript
import { eq } from '@type32/tauri-sqlite-orm'

// ✅ SAFE: Will execute successfully
await orm.update(users)
  .set({ isActive: false })
  .where(eq(users._.columns.id, 123))
  .execute()

// ❌ UNSAFE: Throws MissingWhereClauseError
await orm.update(users)
  .set({ isActive: false })
  .execute()
```

### Intentional Global Operations

If you genuinely want to update/delete all rows, use `.allowGlobalOperation()`:

```typescript
// Explicitly allow updating all rows
await orm.update(users)
  .set({ lastChecked: new Date() })
  .allowGlobalOperation()
  .execute()

// Explicitly allow deleting all rows
await orm.delete(tempLogs)
  .allowGlobalOperation()
  .execute()
```

### Examples

```typescript
const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
})

// ❌ Error: Missing WHERE clause
try {
  await orm.update(users).set({ isActive: false }).execute()
} catch (error) {
  console.error(error.message)
  // "UPDATE operation on table "users" requires a WHERE clause..."
}

// ✅ With WHERE clause
await orm.update(users)
  .set({ isActive: false })
  .where(eq(users._.columns.id, 5))
  .execute()

// ✅ With multiple conditions
await orm.update(users)
  .set({ name: 'Updated' })
  .where(
    and(
      gt(users._.columns.id, 100),
      eq(users._.columns.isActive, true)
    )
  )
  .execute()

// ✅ Explicit global operation
await orm.update(users)
  .set({ isActive: true })
  .allowGlobalOperation()
  .execute()
```

### DELETE Examples

```typescript
// ❌ Error: Missing WHERE clause
try {
  await orm.delete(users).execute()
} catch (error) {
  console.error(error.message)
}

// ✅ With WHERE clause
await orm.delete(users)
  .where(eq(users._.columns.id, 5))
  .execute()

// ✅ Delete with complex conditions
await orm.delete(users)
  .where(
    and(
      lt(users._.columns.lastLogin, oneYearAgo),
      eq(users._.columns.isActive, false)
    )
  )
  .execute()

// ✅ Explicit global delete
await orm.delete(tempCache)
  .allowGlobalOperation()
  .execute()
```

### Debugging with .toSQL()

The `.toSQL()` method doesn't validate WHERE clauses (it's for debugging):

```typescript
// This works - shows you the SQL without executing
const { sql, params } = orm.update(users)
  .set({ name: 'Bob' })
  .toSQL()

console.log(sql) // Shows the UPDATE statement

// But executing without WHERE will throw
// await orm.update(users).set({ name: 'Bob' }).execute() // ❌ Error
```

## Increment/Decrement Helpers

Safely increment or decrement numeric columns without race conditions.

### Basic Usage

```typescript
const posts = sqliteTable('posts', {
  id: integer('id').primaryKey().autoincrement(),
  title: text('title').notNull(),
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
})

// Increment views by 1 (default)
await orm.update(posts)
  .increment('views')
  .where(eq(posts._.columns.id, 123))
  .execute()

// Increment by custom amount
await orm.update(posts)
  .increment('views', 5)
  .where(eq(posts._.columns.id, 123))
  .execute()

// Decrement likes
await orm.update(posts)
  .decrement('likes')
  .where(eq(posts._.columns.id, 123))
  .execute()

// Decrement by custom amount
await orm.update(posts)
  .decrement('likes', 2)
  .where(eq(posts._.columns.id, 123))
  .execute()
```

### Why Use Increment/Decrement?

These helpers generate atomic SQL operations that prevent race conditions:

```typescript
// ❌ BAD: Race condition possible
const post = await orm.select(posts).where(eq(posts._.columns.id, 123)).get()
await orm.update(posts)
  .set({ views: post.views + 1 })
  .where(eq(posts._.columns.id, 123))
  .execute()

// ✅ GOOD: Atomic operation, no race condition
await orm.update(posts)
  .increment('views')
  .where(eq(posts._.columns.id, 123))
  .execute()
```

### Generated SQL

```typescript
// orm.update(posts).increment('views').where(...)
// Generates: UPDATE posts SET views = views + 1 WHERE ...

// orm.update(posts).decrement('likes', 2).where(...)
// Generates: UPDATE posts SET likes = likes - 2 WHERE ...
```

### Combining with .set()

You can combine increment/decrement with regular updates:

```typescript
await orm.update(posts)
  .set({ lastViewed: new Date() })
  .increment('views')
  .where(eq(posts._.columns.id, 123))
  .execute()

// Generates: UPDATE posts SET last_viewed = ?, views = views + 1 WHERE id = ?
```

### Multiple Increments/Decrements

```typescript
await orm.update(posts)
  .increment('views', 5)
  .increment('shares', 1)
  .decrement('reportCount', 1)
  .where(eq(posts._.columns.id, 123))
  .execute()
```

### Error Handling

```typescript
try {
  await orm.update(posts)
    .increment('nonExistentColumn' as any)
    .where(eq(posts._.columns.id, 123))
    .execute()
} catch (error) {
  if (error instanceof ColumnNotFoundError) {
    console.error('Column does not exist:', error.message)
    // "Column \"nonExistentColumn\" does not exist on table \"posts\""
  }
}
```

### Real-World Examples

#### Article Views Counter

```typescript
// Increment views when article is read
export async function trackArticleView(articleId: number) {
  await orm.update(articles)
    .increment('views')
    .set({ lastViewed: new Date() })
    .where(eq(articles._.columns.id, articleId))
    .execute()
}
```

#### Like/Unlike System

```typescript
export async function likePost(postId: number) {
  await orm.update(posts)
    .increment('likes')
    .where(eq(posts._.columns.id, postId))
    .execute()
}

export async function unlikePost(postId: number) {
  await orm.update(posts)
    .decrement('likes')
    .where(eq(posts._.columns.id, postId))
    .execute()
}
```

#### Inventory Management

```typescript
export async function purchaseProduct(productId: number, quantity: number) {
  await orm.update(products)
    .decrement('stock', quantity)
    .increment('sold', quantity)
    .where(eq(products._.columns.id, productId))
    .execute()
}
```

#### Rate Limiting

```typescript
const rateLimits = sqliteTable('rate_limits', {
  userId: integer('user_id').primaryKey(),
  requestCount: integer('request_count').notNull().default(0),
  resetAt: integer('reset_at', { mode: 'timestamp' }).notNull(),
})

export async function checkRateLimit(userId: number) {
  const now = new Date()
  
  // Increment request count
  await orm.update(rateLimits)
    .increment('requestCount')
    .where(eq(rateLimits._.columns.userId, userId))
    .execute()
  
  // Check if over limit
  const limit = await orm.select(rateLimits)
    .where(eq(rateLimits._.columns.userId, userId))
    .get()
  
  if (limit.requestCount > 100) {
    throw new Error('Rate limit exceeded')
  }
}
```

## Best Practices

### 1. Always Use WHERE Clauses

```typescript
// ❌ BAD: Will throw error
await orm.delete(users).execute()

// ✅ GOOD: Explicit WHERE clause
await orm.delete(users).where(eq(users._.columns.id, userId)).execute()
```

### 2. Catch Specific Errors

```typescript
try {
  await orm.update(users).set({ name: 'Bob' }).execute()
} catch (error) {
  if (error instanceof MissingWhereClauseError) {
    // Handle missing WHERE specifically
    console.error('Missing WHERE clause')
  } else if (error instanceof UpdateValidationError) {
    // Handle validation errors
    console.error('Validation failed')
  } else {
    // Re-throw unknown errors
    throw error
  }
}
```

### 3. Use Increment/Decrement for Counters

```typescript
// ❌ BAD: Race conditions
const user = await orm.select(users).where(eq(users._.columns.id, id)).get()
await orm.update(users).set({ points: user.points + 10 }).where(eq(users._.columns.id, id)).execute()

// ✅ GOOD: Atomic operation
await orm.update(users).increment('points', 10).where(eq(users._.columns.id, id)).execute()
```

### 4. Document Global Operations

```typescript
// ✅ GOOD: Clear intent with comment
// Reset all daily counts - this is intentional
await orm.update(stats)
  .set({ dailyCount: 0 })
  .allowGlobalOperation()
  .execute()
```

### 5. Validate Before Operations

```typescript
async function updateUser(userId: number, data: Partial<User>) {
  if (!userId) {
    throw new ValidationError('User ID is required')
  }
  
  await orm.update(users)
    .set(data)
    .where(eq(users._.columns.id, userId))
    .execute()
}
```

### 6. Use toSQL() for Debugging

```typescript
const query = orm.update(users).set({ name: 'Bob' }).where(eq(users._.columns.id, 1))

// Debug without executing
console.log(query.toSQL())
// { sql: 'UPDATE users SET name = ? WHERE id = ?', params: ['Bob', 1] }

// Execute when ready
await query.execute()
```

## Summary

The ORM provides multiple layers of safety:

1. **Custom Error Classes**: Clear, specific error messages for different failure types
2. **WHERE Validation**: Prevents accidental mass updates/deletes
3. **Increment/Decrement**: Atomic operations prevent race conditions
4. **Type Safety**: TypeScript catches errors at compile time
5. **.toSQL()**: Debug queries before execution

These features work together to make your database operations safer and more reliable.

