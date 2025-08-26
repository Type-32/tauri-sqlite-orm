## Getting Started

### Install

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

### Create an ORM instance

```ts
import { TauriORM } from "@type32/tauri-sqlite-orm";

const db = new TauriORM("sqlite:app.db");
```

### Define schema

```ts
import {
  defineTable,
  integer,
  text,
  relations,
} from "@type32/tauri-sqlite-orm";

export const users = defineTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const posts = defineTable("posts", {
  id: integer("id").primaryKey(),
  content: text("content"),
  authorId: integer("author_id"),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

db.configure({ users, posts }, { users: usersRelations });
await db.migrateConfigured({ name: "init:users,posts" });
```

### Basic usage

```ts
// insert
await db.insert(users).values({ name: "Dan" }).execute();

// select
const list = await db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(eq(users.name, "Dan"))
  .execute();
```
