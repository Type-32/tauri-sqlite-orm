## SELECT Queries

This guide explains how to retrieve data from your database using `SELECT` queries.

### Basic SELECT

To select all columns from a table, use the `db.select()` method and pass the table object.

```typescript
import { db } from "./db";
import { users } from "./db/schema";

// Selects all columns from the 'users' table
const allUsers = await db.select(users).execute();
```

### Selecting Specific Columns

If you only need certain columns, you can pass an array of column names as the second argument to `db.select()`.

```typescript
// Selects only the 'id' and 'name' columns
const userNames = await db.select(users, ["id", "name"]).execute();
```

### Filtering with WHERE

Use the `.where()` method to filter your results. It accepts condition objects created by helpers like `eq`, `gt`, `lt`, etc.

```typescript
import { eq, and, gt, lt, inArray, isNotNull } from "@type32/tauri-sqlite-orm";

// Select a user by their ID
const user = await db.select(users).where(eq(users.id, 1)).execute();

// Combine multiple conditions with `and` or `or`
const specificUsers = await db
  .select(users)
  .where(and(gt(users.id, 5), lt(users.id, 10)))
  .execute();

// Use `inArray` to find records with a value in a list
const usersByIds = await db
  .select(users)
  .where(inArray(users.id, [1, 3, 5]))
  .execute();

// Check for non-null values
const usersWithNames = await db
  .select(users)
  .where(isNotNull(users.name))
  .execute();
```

### Ordering, Limiting, and Offsetting

You can control the presentation of your results with the following methods:

- `.orderBy(column, direction)`: Sorts the results. `direction` can be `'ASC'` or `'DESC'`.
- `.limit(count)`: Limits the number of returned rows.
- `.offset(count)`: Skips a specified number of rows.

```typescript
// Get the 10 oldest users
const oldestUsers = await db
  .select(users)
  .orderBy(users.createdAt, "ASC")
  .limit(10)
  .execute();

// Paginate through users
const page = 2;
const pageSize = 20;
const paginatedUsers = await db
  .select(users)
  .limit(pageSize)
  .offset((page - 1) * pageSize)
  .execute();
```
