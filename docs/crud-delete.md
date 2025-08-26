## DELETE Operations

This guide explains how to remove records from your database.

### Basic DELETE

To delete records, use the `db.delete()` method and specify the table. You should almost always chain a `.where()` clause to specify which records to delete.

```typescript
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "@type32/tauri-sqlite-orm";

// Delete a user by their ID
const result = await db.delete(users).where(eq(users.id, 1));

// The `execute` method returns the number of affected rows
console.log("Rows affected:", result);
```

### Deleting All Records

If you omit the `.where()` clause, all records from the specified table will be deleted. **Use this with caution.**

```typescript
// Deletes all users from the table
await db.delete(users);
```
