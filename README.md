## Tauri SQLite ORM

A Drizzle-like TypeScript ORM tailored for Tauri v2's `@tauri-apps/plugin-sql` (SQLite). It provides a simple, type-safe query builder and migration tools to help you manage your database with ease.

### Features

- **Drizzle-like Schema:** Define your database schema using a familiar, chainable API.
- **Type-Safe Query Builder:** Build SQL queries with TypeScript, ensuring type safety and autocompletion.
- **Relations Support:** Define and query one-to-one, one-to-many, and many-to-many relationships between tables.
- **Nested Includes:** Load relations of relations with intuitive nested syntax.
- **Advanced Operators:** Comprehensive set of operators including `ne`, `between`, `notIn`, `ilike`, `startsWith`, `endsWith`, `contains`, and more.
- **Subquery Support:** Use subqueries in WHERE and SELECT clauses with full type safety.
- **Aggregate Functions:** Type-safe aggregates like `count`, `sum`, `avg`, `min`, `max`, and SQLite's `groupConcat`.
- **Query Debugging:** Use `.toSQL()` on any query to inspect generated SQL and parameters.
- **Safety Features:** Automatic WHERE clause validation for UPDATE/DELETE prevents accidental data loss.
- **Increment/Decrement:** Atomic increment/decrement operations for safe counter updates.
- **Better Error Handling:** Custom error classes for clear, actionable error messages.
- **Simplified Migrations:** Keep your database schema in sync with your application's models using automatic schema detection and migration tools.
- **Lightweight & Performant:** Designed to be a thin layer over the Tauri SQL plugin, ensuring minimal overhead.

### Installation

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Make sure the SQL plugin is registered on the Rust side (see Tauri docs).

### Quick Example

```typescript
import Database from '@tauri-apps/plugin-sql'
import { TauriORM, sqliteTable, int, text, relations } from '@type32/tauri-sqlite-orm'

// Define tables
const users = sqliteTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
})

const posts = sqliteTable('posts', {
  id: int('id').primaryKey().autoincrement(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  userId: int('user_id').notNull().references(users, 'id'),
})

// Define relations
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}))

const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts._.columns.userId],
    references: [users._.columns.id],
  }),
}))

// Initialize ORM
const db = await Database.load('sqlite:mydb.db')
const orm = new TauriORM(db, {
  users,
  usersRelations,
  posts,
  postsRelations,
})

// Run migrations
await orm.migrate()

// Query with relations
const usersWithPosts = await orm
  .select(users)
  .include({ posts: true })
  .all()
```

### Documentation

- [Many-to-Many Relations Guide](./docs/many-to-many-example.md) - Learn how to implement many-to-many relationships with junction tables
- [Advanced Queries Guide](./docs/advanced-queries-example.md) - Learn about `.toSQL()`, aggregates, and subqueries
- [Error Handling and Safety](./docs/error-handling-and-safety.md) - Learn about WHERE validation, increment/decrement, and error handling

### Relations

The ORM supports three types of relations:

1. **One-to-One / Many-to-One**: Use `one()` to define a relation where the current table references another table
2. **One-to-Many**: Use `many()` to define a relation where another table references the current table
3. **Many-to-Many**: Use `manyToMany()` to define a many-to-many relation through a junction table

See the [many-to-many example](./docs/many-to-many-example.md) for detailed usage.
