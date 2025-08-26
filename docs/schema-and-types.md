## Schema and Types

This guide covers how to define your database schema, including tables, columns, and their types.

### Table Definition

To define a table, use the `sqliteTable` helper. It takes the table name as the first argument and an object defining the columns as the second.

```typescript
import { sqliteTable, text, integer } from "@type32/tauri-sqlite-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey().autoincrement(),
  name: text("name").notNull(),
  email: text("email").unique(),
});
```

### Column Types

The following column type helpers are available:

- `text(name)`: For storing strings (`TEXT`).
- `integer(name, config?)`: For storing integers (`INTEGER`).
- `real(name)`: For storing floating-point numbers (`REAL`).
- `blob(name)`: For storing binary data (`BLOB`).
- `boolean(name)`: For storing boolean values (`BOOLEAN`, stored as `INTEGER` 0 or 1).

**Configuration**

The `integer` column type accepts an optional `config` object with a `mode` property:

- `{ mode: 'timestamp' }`: The value will be treated as a `Date` object, stored as a UNIX timestamp in seconds.
- `{ mode: 'timestamp_ms' }`: The value will be treated as a `Date` object, stored as a UNIX timestamp in milliseconds.

### Column Modifiers

Each column helper returns a chainable object that you can use to add constraints and options:

- `.primaryKey()`: Marks the column as the primary key.
- `.autoincrement()`: Enables auto-incrementing for the column. Typically used with `primaryKey`.
- `.notNull()`: Adds a `NOT NULL` constraint.
- `.unique()`: Adds a `UNIQUE` constraint.
- `.default(value)`: Sets a default value for the column.
- `.$defaultFn(() => value)`: Sets a default value using a function that is executed at insertion time.
- `.references(() => otherTable.column)`: Sets up a foreign key relationship.
- `.$onUpdateFn(() => value)`: Sets a function to generate a value on update.

**Example with Modifiers**

```typescript
import { sqliteTable, text, integer } from "@type32/tauri-sqlite-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey().autoincrement(),
  name: text("name").notNull(),
  role: text("role").default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
```

### Type Inference

The ORM can automatically infer TypeScript types from your schema definitions, which is useful for ensuring type safety in your application code.

- `InferSelectModel<T>`: Infers the type of a record returned from a `SELECT` query.
- `InferInsertModel<T>`: Infers the type for an `INSERT` operation. It makes columns with default values optional.

**Usage**

```typescript
import { users } from "./schema";
import { InferSelectModel, InferInsertModel } from "@type32/tauri-sqlite-orm";

type User = InferSelectModel<typeof users>;
// type User = {
//   id: number;
//   name: string;
//   email: string | null | undefined;
// }

type NewUser = InferInsertModel<typeof users>;
// type NewUser = {
//   id?: number | null | undefined;
//   name: string;
//   email?: string | null | undefined;
// }
```
