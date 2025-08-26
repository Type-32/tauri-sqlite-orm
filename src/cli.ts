#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const help = `
tauriorm-kit

Usage:
  bunx tauriorm-kit generate --out ./src/lib/db-client.ts --schema ./src/lib/schema.ts

Options:
  --out <file>     Output file where a typed client factory will be written
  --schema <file>  Path to a module that exports your tables and optional relations
  --driver <uri>   Database URI (default: sqlite:app.db)
`;

type TablesModule = {
  default?: any;
  tables?: Record<string, any>;
  relations?: Record<string, any>;
  [k: string]: any;
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(help);
    process.exit(0);
  }
  const cmd = args[0];
  if (cmd !== "generate") {
    console.error("Unknown command.\n" + help);
    process.exit(1);
  }
  const outIdx = args.indexOf("--out");
  const schemaIdx = args.indexOf("--schema");
  const driverIdx = args.indexOf("--driver");
  if (outIdx === -1 || schemaIdx === -1) {
    console.error("Missing --out or --schema.\n" + help);
    process.exit(1);
  }
  const outPath = resolve(process.cwd(), args[outIdx + 1]);
  const schemaPath = resolve(process.cwd(), args[schemaIdx + 1]);
  const driverUri = driverIdx !== -1 ? args[driverIdx + 1] : "sqlite:app.db";

  // Generate a thin, typed wrapper that preserves intellisense for db.query.*
  // The user will import their schema into this wrapper.
  const content = `
import { TauriORM } from "@type32/tauri-sqlite-orm";
import * as Schema from ${JSON.stringify(schemaPath)};

export function createDb() {
  const db = new TauriORM(${JSON.stringify(driverUri)}).configure(
    // collect tables: any export that looks like a table (has _tableName)
    Object.fromEntries(
      Object.entries(Schema).filter(([, v]) => v && typeof v === 'object' && '_tableName' in v)
    ) as any,
    // optional relations export
    (Schema as any).relations || {}
  );
  return db;
}
`;

  const dir = resolve(outPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, content, "utf8");
  console.log(`✔ Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
