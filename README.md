## Tauri SQLite ORM

A Drizzle-like TypeScript ORM tailored for Tauri v2's `@tauri-apps/plugin-sql` (SQLite). It provides a simple, type-safe query builder and migration tools to help you manage your database with ease.

### Features

- **Drizzle-like Schema:** Define your database schema using a familiar, chainable API.
- **Type-Safe Query Builder:** Build SQL queries with TypeScript, ensuring type safety and autocompletion.
- **Simplified Migrations:** Keep your database schema in sync with your application's models using automatic schema detection and migration tools.
- **Lightweight & Performant:** Designed to be a thin layer over the Tauri SQL plugin, ensuring minimal overhead.

### Installation

```bash
bun add @type32/tauri-sqlite-orm @tauri-apps/plugin-sql
```

Make sure the SQL plugin is registered on the Rust side (see Tauri docs).
