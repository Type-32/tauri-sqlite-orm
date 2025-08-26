## CRUD: Update

### Basic

```ts
await db.update(users).set({ name: "Mr. Dan" }).where(eq(users.name, "Dan"));
```

Notes:

- Undefined values in .set({...}) are ignored; use null to set NULL.
- You can pass SQL expressions: `.set({ updatedAt: raw`NOW()` })`.

### Order/limit

```ts
await db
  .update(users)
  .set({ verified: true })
  .orderBy(asc(users.name))
  .limit(2);
```

### Returning (SQLite)

```ts
const rows = await db
  .update(users)
  .set({ name: "Mr. Dan" })
  .where(eq(users.name, "Dan"))
  .returning({ updatedId: users.id });
```

### Update … from (SQLite)

```ts
await db
  .update(users)
  .set({ cityId: cities.id })
  .from(cities)
  .where(and(eq(cities.name, "Seattle"), eq(users.name, "John")));
```
