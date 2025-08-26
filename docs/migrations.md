## Migrations

The ORM provides a straightforward way to keep your database schema in sync with your application's schema definition.

### Automatic Migrations with `migrateIfDirty`

The recommended way to handle migrations is to use the `migrateIfDirty()` method when you initialize the ORM. This method automatically detects changes in your schema and applies them.

1.  **Schema Signature:** The ORM computes a "signature" of your schema definition (tables, columns, types, constraints).
2.  **Comparison:** It compares this signature to the one stored in a special `_schema_meta` table in your database.
3.  **Migration:** If the signatures don't match (meaning your schema has changed), it runs the necessary `CREATE TABLE` statements to align the database with your schema.
4.  **Signature Update:** After a successful migration, it updates the stored signature to the new one.

**Usage:**

```typescript
// src/db/index.ts
import { TauriORM } from "@type32/tauri-sqlite-orm";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

const dbInstance = await Database.load("sqlite:app.db");
export const db = new TauriORM(dbInstance, schema);

// This will automatically run migrations on startup if needed
await db.migrateIfDirty();
```

### Manual Migrations with `migrate`

If you prefer to run migrations manually, you can use the `migrate()` method. This will attempt to create all the tables defined in your schema without checking for changes first. It uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times.

```typescript
// Manually run migrations to ensure all tables exist
await db.migrate();
```

This approach is simpler but less efficient, as it doesn't track schema changes. It's generally better to use `migrateIfDirty()` for most use cases.
