## INSERT Operations

This guide covers how to insert new records into your database tables.

### Basic INSERT

To insert a single record, use the `db.insert()` method, followed by `.values()` with the data object.

```typescript
import { db } from "./db";
import { users } from "./db/schema";

// Insert a single user
const result = await db.insert(users).values({
  name: "John Doe",
  email: "john.doe@example.com",
});

// The `execute` method returns the last inserted ID
console.log("Inserted user with ID:", result);
```

### Inserting Multiple Records

You can insert multiple records at once by passing an array of objects to the `.values()` method.

```typescript
// Insert multiple users in a single query
await db.insert(users).values([
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
]);
```
