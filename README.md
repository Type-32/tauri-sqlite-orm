## tauri-sqlite-orm

A Drizzle-like TypeScript ORM tailored for Tauri v2's `@tauri-apps/plugin-sql` (SQLite). Plug-and-play for Nuxt/Tauri apps: define schema in TS, run tracked migrations, and query with a soft-relations API.

### Install

```bash
pnpm add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Make sure the SQL plugin is registered on the Rust side (see Tauri docs).

### Quick start

```ts
import {
  initDb,
  db,
  defineTable,
  integer,
  text,
  relations,
} from "tauri-sqlite-orm";

await initDb("sqlite:app.db");

export const users = defineTable("users", {
  id: integer("id", { isPrimaryKey: true, autoIncrement: true }).primaryKey({
    autoIncrement: true,
  }),
  name: text("name").notNull(),
  email: text("email"),
});

export const posts = defineTable("posts", {
  id: integer("id", { isPrimaryKey: true }).primaryKey(),
  content: text("content"),
  randomId: text("random_id").$defaultFn(() => crypto.randomUUID()),
  authorId: integer("author_id"),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

db.configure({ users, posts }, { users: usersRelations });
await db.migrateConfigured({ name: "init:users,posts" });

// Create
await db
  .insert(users)
  .values({ name: "Dan", email: "dan@example.com" })
  .execute();

// Query with relations (join-based when flat)
const res = await db.query.users.findMany({
  with: { posts: true },
  join: true,
});
```

### Schema builder

Chainable, Drizzle-style:

```ts
import {
  defineTable,
  integer,
  text,
  real,
  blob,
  numeric,
  sql,
} from "tauri-sqlite-orm";

type Data = { foo: string; bar: number };

export const example = defineTable("example", {
  id: integer("id", { isPrimaryKey: true, autoIncrement: true }).primaryKey({
    autoIncrement: true,
  }),
  isActive: integer("is_active", { mode: "boolean" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(strftime('%s','now'))`
  ),
  rating: real("rating"),
  status: text("status", { enum: ["active", "inactive"] as const }),
  name: text("name").notNull().default("Anonymous"),
  data: blob("data"),
  jsonField: blob("json_field", { mode: "json" }).$type<Data>(),
  bigCounter: blob("big_counter", { mode: "bigint" }),
  valueNumeric: numeric("value_numeric"),
  valueNumericNum: numeric("value_numeric_num", { mode: "number" }),
  valueNumericBig: numeric("value_numeric_big", { mode: "bigint" }),
});

// Foreign key
export const posts = defineTable("posts", {
  id: integer("id", { isPrimaryKey: true }).primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
});
```

### Migrations

Tracked simple migrations are part of the ORM instance:

```ts
// one-off for specific tables
await db.migrate([users, posts], { name: "init:users,posts" });

// or using configured schema
await db.migrateConfigured({ name: "init:users,posts" });
```

DDL emitted respects: primaryKey + autoIncrement, notNull, default(value or sql), references (with onDelete/onUpdate).

### CRUD (Drizzle-like builders)

```ts
// Insert
await db.insert(users).values({ name: "Alice" }).execute();
await db
  .insert(users)
  .values([{ name: "A" }, { name: "B" }])
  .execute();

// Update
import { eq } from "tauri-sqlite-orm";
await db
  .update(users)
  .set({ email: "new@mail.com" })
  .where(eq(users.id, 1))
  .execute();

// Delete
await db.delete(users).where(eq(users.id, 2)).execute();
```

### Query API (relations)

Auto-generated with `db.configure(tables, relations?)`:

```ts
// Flat relations with join
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
  join: true,
  where: { id: 1 },
  orderBy: ["users.id ASC"],
  limit: 10,
  offset: 0,
  columns: { id: true, name: true },
});

// Nested relations (batched loader)
const nested = await db.query.users.findMany({
  with: {
    posts: {
      with: { comments: true },
      columns: ["id", "content"],
    },
  },
});
```

Notes:

- `where` accepts SQL helpers (eq, lt, gte, like) or object map.
- `columns` accepts string[] or object map of base table columns.
- `join: true` only for one-level `with` (flat). Nested uses batched selects.

### SQL helpers

```ts
import { eq, ne, gt, gte, lt, lte, like, asc, desc } from "tauri-sqlite-orm";
db.query.posts.findMany({
  where: eq(posts.authorId, 1),
  orderBy: [asc(posts.id)],
});
```

### Nuxt + Tauri usage

Initialize in a client plugin and ensure `initDb()` runs once:

```ts
// plugins/orm.client.ts
import { initDb, db } from "tauri-sqlite-orm";
import { users, posts, usersRelations } from "@/lib/schema";

export default defineNuxtPlugin(async () => {
  await initDb("sqlite:app.db");
  db.configure({ users, posts }, { users: usersRelations });
  await db.migrateConfigured({ name: "init:users,posts" });
});
```

### Roadmap

- Aliasing helpers and typed orderBy (asc(users.id)) for findMany
- Unique(), check(), composite primary/unique constraints
- Insert returning / batch returning (where feasible)

### License

MIT
