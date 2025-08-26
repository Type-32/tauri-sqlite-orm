## Transactions

SQLite transactions with nested savepoints.

```ts
await db.transaction(async (tx) => {
  await tx
    .update(accounts)
    .set({ balance: raw`${accounts.balance} - 100.00` })
    .where(eq(users.name, "Dan"));
  await tx
    .update(accounts)
    .set({ balance: raw`${accounts.balance} + 100.00` })
    .where(eq(users.name, "Andrew"));

  await tx.transaction(async (tx2) => {
    await tx2
      .update(users)
      .set({ name: "Mr. Dan" })
      .where(eq(users.name, "Dan"));
  });
});
```

Rollback helper:

```ts
await db.transaction(async (tx) => {
  const [account] = await tx
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(users.name, "Dan"));
  if (account.balance < 100) tx.rollback();
});
```

Behavior:

```ts
await db.transaction(
  async (tx) => {
    /* ... */
  },
  { behavior: "immediate" }
);
```
