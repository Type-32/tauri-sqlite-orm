## UPDATE Operations

This guide demonstrates how to update existing records in your database.

### Basic UPDATE

To update records, use the `db.update()` method, followed by `.set()` to specify the new values and `.where()` to define which records should be updated.

```typescript
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "@type32/tauri-sqlite-orm";

// Update a user's email by their ID
const result = await db
  .update(users)
  .set({ email: "new.email@example.com" })
  .where(eq(users.id, 1));

// The `execute` method returns the number of affected rows
console.log("Rows affected:", result);
```

### Updating Multiple Columns

You can update multiple columns at once by providing more properties in the `.set()` object.

```typescript
// Update both name and email for a user
await db
  .update(users)
  .set({
    name: "Jane Smith",
    email: "jane.smith@example.com",
  })
  .where(eq(users.id, 2));
```

The `.where()` clause is crucial. Without it, the `UPDATE` statement would apply to all rows in the table, which is usually not the intended behavior.
