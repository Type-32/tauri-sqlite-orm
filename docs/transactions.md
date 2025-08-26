## Transactions

For operations that need to be atomic (either all succeed or all fail), you can use transactions. The ORM provides a `db.transaction()` method that wraps your operations in a database transaction.

### Basic Transaction

The `db.transaction()` method takes an async callback function. Inside this function, you receive a `TauriORM` instance that is scoped to the transaction. Use this instance to perform your database operations.

If the callback function completes successfully, the transaction is committed. If it throws an error, the transaction is automatically rolled back.

```typescript
import { db } from "./db";
import { users, accounts } from "./db/schema";
import { eq } from "@type32/tauri-sqlite-orm";

try {
  await db.transaction(async (tx) => {
    // `tx` is a `TauriORM` instance for this transaction

    // Example: Transferring money between accounts
    const sender = await tx
      .select(accounts)
      .where(eq(accounts.userId, 1))
      .execute();
    const receiver = await tx
      .select(accounts)
      .where(eq(accounts.userId, 2))
      .execute();

    if (sender[0].balance < 100) {
      // This error will cause the transaction to be rolled back
      throw new Error("Insufficient funds");
    }

    await tx
      .update(accounts)
      .set({ balance: sender[0].balance - 100 })
      .where(eq(accounts.userId, 1));

    await tx
      .update(accounts)
      .set({ balance: receiver[0].balance + 100 })
      .where(eq(accounts.userId, 2));
  });

  console.log("Transaction successful!");
} catch (error) {
  console.error("Transaction failed:", error.message);
}
```

In the example above, if the sender's balance is less than 100, an error is thrown. This prevents the `COMMIT` statement from being executed and triggers a `ROLLBACK`, ensuring that neither account balance is changed.
