## Migrations

Integrated on the ORM instance.

### Configure and migrate

```ts
db.configure({ users, posts }, { users: usersRelations });
await db.migrateConfigured({ name: "init:users,posts" });
Note:

- `migrateConfigured` always applies the configured schema (idempotent). If you prefer to only apply changes when your schema has changed, call `migrateIfDirty()` instead.

```

### Force push and schema diff

```ts
await db.forcePush({ preserveData: true });
const diff = await db.diffSchema();
```

### Dirty-check migration

```ts
const changed = await db.migrateIfDirty();

### Behavior details

- `migrateConfigured` now enforces the configured schema using a safe force-push (adds missing tables/columns, rebuilds incompatible tables preserving shared columns) and records the current schema signature for future dirty checks.
- `migrateIfDirty` computes a normalized schema signature and, if different, safely applies schema changes (same force-push strategy) and updates the stored signature. This means schema changes are actually applied, not just recorded.
- Foreign keys are enabled automatically via `PRAGMA foreign_keys=ON` when the DB loads.
- Table-level constraints declared via `defineTable(..., extras => [...])` are emitted in `CREATE TABLE` (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY).
- Indexes declared with `index/uniqueIndex` are created automatically after table creation and after rebuilds.
```
