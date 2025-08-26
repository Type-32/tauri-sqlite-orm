## Relations

Define with `relations(base, ({ one, many }) => ({ ... }))`.

Supports:

- one-to-one (FK on either child or base via fields/references)
- one-to-many
- many-to-many via junction tables

Querying:

```ts
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
  join: true,
});

const nested = await db.query.users.findMany({
  with: { posts: { with: { comments: true } } },
});

const first = await db.query.users.findFirst({
  where: (u, { eq }) => eq(u.id, 1),
});
```
