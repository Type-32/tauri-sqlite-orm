## Getting Started

### Installation

First, add the ORM and the Tauri SQL plugin to your project:

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Ensure you have configured the SQL plugin in your `Cargo.toml` and registered it in your Rust application setup as per the official Tauri documentation.

### Schema Definition

Create a file to define your database schema, for example, `src/db/schema.ts`. Use the `sqliteTable` and column helpers to define your tables.

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
```

### ORM Initialization

Create a central file for your database instance, e.g., `src/db/index.ts`. Here, you will load the database, create an instance of `TauriORM`, and run migrations.

```typescript
// src/db/index.ts
import { TauriORM } from "@type32/tauri-sqlite-orm";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

// Load the database using the Tauri SQL plugin
const dbInstance = await Database.load("sqlite:app.db");

// Create the ORM instance, passing the database and schema
export const db = new TauriORM(dbInstance, schema);

// Run migrations to create or update tables
await db.migrateIfDirty();
```

By calling `migrateIfDirty()`, the ORM will automatically compare your schema definition with the database and apply any necessary changes.

### Basic Usage

Now you can import the `db` instance and your schema to interact with the database from anywhere in your application.

```typescript
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "@type32/tauri-sqlite-orm";

// Insert a new user
await db
  .insert(users)
  .values({ name: "Jane Doe", email: "jane.doe@example.com" });

// Select all users
const allUsers = await db.select(users).execute();

// Select a user with a WHERE clause
const jane = await db
  .select(users)
  .where(eq(users.email, "jane.doe@example.com"))
  .execute();
```
