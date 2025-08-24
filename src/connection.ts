import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

/**
 * Initializes the database connection. This must be called once at the start of your application.
 * @param dbPath The path to the database file, e.g., 'sqlite:mydatabase.db'
 * @returns The database instance.
 */
export async function initDb(dbPath: string): Promise<Database> {
  db = await Database.load(dbPath);
  return db;
}

/**
 * Gets the singleton database instance.
 * @throws If `initDb` has not been called.
 * @returns The database instance.
 */
export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Please call initDb() first.");
  }
  return db;
}
