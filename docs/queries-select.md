## Queries: Select

Drizzle-like, type-safe SQL builder.

### Basic

```ts
await db.select().from(users);
await db.select({ id: users.id, name: users.name }).from(users);
await db
  .select({ id: users.id, lowerName: raw`lower(${users.name})` })
  .from(users);
```

### Filters

```ts
await db.select().from(users).where(eq(users.id, 1));
await db
  .select()
  .from(users)
  .where(and(gt(users.id, 5), lt(users.id, 10)));
await db
  .select()
  .from(users)
  .where(inArray(users.id, [1, 2, 3]));
await db.select().from(users).where(isNotNull(users.name));
```

### Order/limit/offset

```ts
await db.select().from(users).orderBy(asc(users.id)).limit(10).offset(10);
```

### Distinct, groupBy, having

```ts
await db
  .select({ age: users.age, count: raw`count(${users.id})` })
  .from(users)
  .groupBy(users.age)
  .having(gt(raw`count(${users.id})`, 1));
```

### Set operations

```ts
const q1 = db.select({ name: users.name }).from(users);
const q2 = db.select({ name: customers.name }).from(customers);
const res = await db.union(q1, q2).limit(10);
```
