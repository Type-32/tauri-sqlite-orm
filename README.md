## Tauri SQLite ORM

A Drizzle-like TypeScript ORM tailored for Tauri v2's `@tauri-apps/plugin-sql` (SQLite). It provides a simple, type-safe query builder and migration tools to help you manage your database with ease.

### Features

- **Drizzle-like Schema:** Define your database schema using a familiar, chainable API.
- **Type-Safe Query Builder:** Build SQL queries with TypeScript, ensuring type safety and autocompletion.
- **Simplified Migrations:** Keep your database schema in sync with your application's models using automatic schema detection and migration tools.
- **Lightweight & Performant:** Designed to be a thin layer over the Tauri SQL plugin, ensuring minimal overhead.

### Installation

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Make sure the SQL plugin is registered on the Rust side (see Tauri docs).

### Quick Start

Here’s a quick example to get you started:

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer } from "@type32/tauri-sqlite-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey().autoincrement(),
  name: text("name").notNull(),
  email: text("email").unique(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey(),
  content: text("content"),
  authorId: integer("author_id").references(() => users.id),
});

// src/db/index.ts
import { TauriORM } from "@type32/tauri-sqlite-orm";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

// Load the database
const dbInstance = await Database.load("sqlite:app.db");

// Create the ORM instance
export const db = new TauriORM(dbInstance, schema);

// Migrate the database if the schema has changed
await db.migrateIfDirty();

// Now you can use the ORM to interact with your database
const newUser = await db
  .insert(schema.users)
  .values({ name: "John Doe", email: "john.doe@example.com" });
const allUsers = await db.select(schema.users).execute();
```

### Documentation

- [Getting Started](docs/getting-started.md)
- [Schema and Types](docs/schema-and-types.md)
- [CRUD Operations (SELECT)](docs/queries-select.md)
- [CRUD Operations (INSERT)](docs/crud-insert.md)
- [CRUD Operations (UPDATE)](docs/crud-update.md)
- [CRUD Operations (DELETE)](docs/crud-delete.md)
- [Migrations](docs/migrations.md)
- [Transactions](docs/transactions.md)
- [Relations](docs/relations.md)

### Schema Definition

Define your tables and columns using a chainable, Drizzle-style API.

```typescript
import { sqliteTable, text, integer, boolean } from "@type32/tauri-sqlite-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey().autoincrement(),
  name: text("name").notNull(),
  email: text("email").unique(),
  isActive: boolean("is_active").default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
```

### CRUD Operations

Perform `CREATE`, `READ`, `UPDATE`, and `DELETE` operations using a type-safe query builder.

**SELECT**

```typescript
import { eq, and } from "@type32/tauri-sqlite-orm";

// Select all users
const allUsers = await db.select(users).execute();

// Select specific columns
const userNames = await db.select(users, ["name"]).execute();

// Use WHERE conditions
const activeUsers = await db
  .select(users)
  .where(eq(users.isActive, true))
  .execute();
```

**INSERT**

```typescript
// Insert a single user
const newUser = await db
  .insert(users)
  .values({ name: "Jane Doe", email: "jane.doe@example.com" });

// Insert multiple users
await db.insert(users).values([
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
]);
```

**UPDATE**

```typescript
import { eq } from "@type32/tauri-sqlite-orm";

// Update a user's email
await db
  .update(users)
  .set({ email: "new.email@example.com" })
  .where(eq(users._.columns.id, 1));
```

**DELETE**

```typescript
import { eq } from "@type32/tauri-sqlite-orm";

// Delete a user
await db.delete(users).where(eq(users._.columns.id, 1));
```

### Migrations

The ORM includes a simple migration system that automatically detects schema changes and applies them to the database.

```typescript
// This will check if the schema has changed and run migrations if it has
await db.migrateIfDirty();

// You can also run migrations manually
await db.migrate();
```

### Transactions

Run multiple database operations within a transaction to ensure atomicity.

```typescript
await db.transaction(async (tx) => {
  await tx.insert(users).values({ name: "From Transaction" });
  await tx.delete(users).where(eq(users._.columns.id, 1));
});
```

### License

MIT
