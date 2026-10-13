import { join } from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate as runMigrations } from "drizzle-orm/mysql2/migrator";
import { type ConnectionOptions, createConnection } from "mysql2/promise";

/** Resolved relative to this module, not the working directory. */
const MIGRATIONS_FOLDER = join(import.meta.dirname, "../../drizzle");

/**
 * Applies pending migrations from the drizzle/ folder, or another folder of
 * them for a test, to the database at a
 * `mysql://` URL, or the one in mysql2's connection options. Edit a schema
 * file, src/event/schema.ts or src/claims-stand-in/schema.ts, then run
 * `pnpm db:generate` to write the next migration.
 *
 * Runs on Node, from `mise run db:migrate` and the tests' global setup, with
 * mysql2 connecting straight to TiDB. Never when the server starts.
 */
export async function migrate(
  database: string | ConnectionOptions,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const connection = await createConnection(
    typeof database === "string" ? { uri: database } : database,
  );
  try {
    await runMigrations(drizzle({ client: connection }), { migrationsFolder });
  } finally {
    await connection.end();
  }
}
