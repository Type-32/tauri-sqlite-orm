## CRUD: Delete

### Basic

```ts
await db.delete(users);
await db.delete(users).where(eq(users.name, "Dan"));
```

### Order/limit

```ts
await db
  .delete(users)
  .where(eq(users.name, "Dan"))
  .orderBy(asc(users.name))
  .limit(2);
```

### Returning (SQLite)

```ts
const rows = await db
  .delete(users)
  .where(eq(users.name, "Dan"))
  .returning({ deletedId: users.id });
```
