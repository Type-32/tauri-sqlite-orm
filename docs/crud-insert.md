## CRUD: Insert

### Basic

```ts
await db.insert(users).values({ name: "Dan" }).execute();
await db
  .insert(users)
  .values([{ name: "A" }, { name: "B" }])
  .execute();
```

### Returning (SQLite)

```ts
await db.insert(users).values({ name: "Dan" }).returning({ id: users.id });
await db.insert(users).values({ name: "Dan" }).$returningId();
```

### Conflicts (SQLite)

```ts
await db.insert(users).values({ id: 1, name: "John" }).onConflictDoNothing();
await db
  .insert(users)
  .values({ id: 1, name: "Dan" })
  .onConflictDoUpdate({ target: users.id, set: { name: raw`excluded.name` } });
```

### Insert … select

```ts
await db
  .insert(employees)
  .select(
    db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.role, "employee"))
  );
```
