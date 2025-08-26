## Schema & Types

### Column builders

- integer(name, { mode?: 'number' | 'boolean' | 'timestamp' | 'timestamp_ms' })
- text(name, { enum?, mode?: 'json' })
- real(name)
- numeric(name, { mode?: 'string' | 'number' | 'bigint' })
- blob(name, { mode?: 'json' | 'bigint' | 'buffer' })
- boolean(name)
- timestamp(name)
- increments(name) — sugar for INTEGER PRIMARY KEY AUTOINCREMENT

Chainers:

- .primaryKey({ autoIncrement? })
- .notNull()
- .default(value | sql`(... )`)
- .$default(fn), .$defaultFn(fn)
- .$onUpdate(fn), .$onUpdateFn(fn)
- .references(() => otherTable.col, { onDelete?, onUpdate? })

Name optional:

```ts
const t = defineTable("t", {
  json: text({ mode: "json" }), // name defaults to key 'json'
});
```

Type inference:

- table.$inferSelect
- table.$inferInsert (omits PK columns)
