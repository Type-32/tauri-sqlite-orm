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
import { TauriORM, sqliteTable, integer, text, defineRelations, InferSelectModel, InferRelationalSelectModel } from '@type32/tauri-sqlite-orm'

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
  userId: integer('user_id').notNull().references(() => users._.columns.id, { onDelete: 'cascade' }),
})

// Define relations (all in one place)
const schema = { users, posts }
const relations = defineRelations(schema, (r) => ({
  users: {
    posts: r.many.posts({ from: r.users.id, to: r.posts.userId }),
  },
  posts: {
    user: r.one.users({ from: r.posts.userId, to: r.users.id }),
  },
}))

// Initialize ORM
const db = await Database.load('sqlite:mydb.db')
const orm = new TauriORM(db, schema)

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
type UserWithPosts = InferRelationalSelectModel<typeof users, typeof relations.users, typeof withPosts>
```

### Documentation

- [Many-to-Many Relations Guide](./docs/many-to-many-example.md) - Learn how to implement many-to-many relationships with junction tables
- [Advanced Queries Guide](./docs/advanced-queries-example.md) - Learn about `.toSQL()`, aggregates, and subqueries
- [Error Handling and Safety](./docs/error-handling-and-safety.md) - Learn about WHERE validation, increment/decrement, and error handling

### Relations

The ORM uses Drizzle's Relational Queries v2 model: define all relations in one place with `defineRelations`, then load them with `.include()`.

1. **One-to-One / Many-to-One**: `r.one.<table>({ from, to })` — the current table references another
2. **One-to-Many**: `r.many.<table>({ from, to })` — another table references the current table (no matching `one` required)
3. **Many-to-Many**: `r.many.<table>({ from: col.through(junctionCol), to: col.through(junctionCol) })` — direct relation through a junction table
4. **Predefined filters**: `where` on a relation, and `optional: false` for required `one` relations

See the [many-to-many example](./docs/many-to-many-example.md) for detailed usage.
