## Indexes & Constraints

Declare in column builders or via `defineTable(..., extras => [...])`.

### Column-level

```ts
integer("id").primaryKey({ autoIncrement: true }).notNull().default(42);
text("name").notNull();
```

### Extras builder

```ts
import {
  defineTable,
  integer,
  text,
  unique,
  primaryKey,
  check,
  foreignKey,
  index,
  uniqueIndex,
} from "@type32/tauri-sqlite-orm";

export const users = defineTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    email: text("email"),
  },
  (t) => [
    unique("users_username_unique").on(t.username),
    check("username_len", { raw: `length(${t._tableName}.username) > 0` }),
    index("email_idx").on(t.email),
  ]
);

export const profile = defineTable(
  "profile",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"),
  },
  (t) => [
    foreignKey({
      name: "profile_user_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
      onDelete: "cascade",
    }),
  ]
);

export const bookToAuthor = defineTable(
  "book_to_author",
  {
    authorId: integer("author_id"),
    bookId: integer("book_id"),
  },
  (t) => [
    primaryKey({ name: "pk_book_author", columns: [t.bookId, t.authorId] }),
    uniqueIndex("author_idx").on(t.authorId),
  ]
);
```

Notes:

- Specs are stored on `table._constraints` and `table._indexes` for DDL/migrations.
- Foreign key actions: onDelete/onUpdate support cascade/restrict/no action/set null/set default.
