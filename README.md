## Tauri SQLite ORM

A Drizzle-like TypeScript ORM tailored for Tauri v2's `@tauri-apps/plugin-sql` (SQLite). It provides a simple, type-safe query builder and migration tools to help you manage your database with ease.

### Features

- **Drizzle-like Schema:** Define your database schema using a familiar, chainable API.
- **Strict Type Inference:** Full TypeScript type safety with no `any` types - nullable columns, custom types, and required/optional fields are accurately inferred.
- **Type-Safe Query Builder:** Build SQL queries with TypeScript, ensuring type safety and autocompletion.
- **Relations Support:** Define and query one-to-one, one-to-many, and many-to-many (via junction tables, Drizzle-style) relationships between tables.
- **Nested Includes:** Load relations of relations with intuitive nested syntax.
- **Advanced Operators:** Comprehensive set of operators including `ne`, `between`, `notIn`, `ilike`, `startsWith`, `endsWith`, `contains`, and more.
- **Subquery Support:** Use subqueries in WHERE and SELECT clauses with full type safety.
- **Aggregate Functions:** Type-safe aggregates like `count`, `sum`, `avg`, `min`, `max`, and SQLite's `groupConcat`.
- **Query Debugging:** Use `.toSQL()` on any query to inspect generated SQL and parameters.
- **Safety Features:** Automatic WHERE clause validation for UPDATE/DELETE prevents accidental data loss.
- **Increment/Decrement:** Atomic increment/decrement operations for safe counter updates.
- **Better Error Handling:** Custom error classes for clear, actionable error messages.
- **Cascade Actions:** `onDelete` and `onUpdate` (cascade, set null, set default, restrict, no action) for foreign key references.
- **Simplified Migrations:** Keep your database schema in sync with your application's models using automatic schema detection and migration tools.
- **Lightweight & Performant:** Designed to be a thin layer over the Tauri SQL plugin, ensuring minimal overhead.

Also, bun is the preferred package manager for developing this library, if you want to contribute.

### Installation

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Make sure the SQL plugin is registered on the Rust side (see Tauri docs).

### Quick Example

```typescript
import Database from '@tauri-apps/plugin-sql'
import { TauriORM, sqliteTable, integer, text, relations, InferSelectModel, InferRelationalSelectModel } from '@type32/tauri-sqlite-orm'

// Define tables
const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
})

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey().autoincrement(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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

// Type relational results with InferRelationalSelectModel
type User = InferSelectModel<typeof users>
const withPosts = { posts: true } as const
type UserWithPosts = InferRelationalSelectModel<typeof users, typeof usersRelations, typeof withPosts>
```

### Documentation

- [Many-to-Many Relations Guide](./docs/many-to-many-example.md) - Learn how to implement many-to-many relationships with junction tables
- [Advanced Queries Guide](./docs/advanced-queries-example.md) - Learn about `.toSQL()`, aggregates, and subqueries
- [Error Handling and Safety](./docs/error-handling-and-safety.md) - Learn about WHERE validation, increment/decrement, and error handling

### Relations

The ORM supports relations in a Drizzle-style pattern:

1. **One-to-One / Many-to-One**: Use `one()` with `fields` and `references` to define a relation where the current table references another table
2. **One-to-Many**: Use `many()` to define a relation where another table references the current table
3. **Many-to-Many**: Use `many(junctionTable)` on both sides and define `one()` on the junction with `fields`/`references` to each entity. Load with nested includes: `include({ postTags: { with: { tag: true } } })`

See the [many-to-many example](./docs/many-to-many-example.md) for detailed usage.
