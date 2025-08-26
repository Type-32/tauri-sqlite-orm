## Migrations

Integrated on the ORM instance.

### Configure and migrate

```ts
db.configure({ users, posts }, { users: usersRelations });
await db.migrateConfigured({ name: "init:users,posts" });
```

### Force push and schema diff

```ts
await db.forcePush({ preserveData: true });
const diff = await db.diffSchema();
```

### Dirty-check migration

```ts
const changed = await db.migrateIfDirty();
```
