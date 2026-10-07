import { join } from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate as runMigrations } from "drizzle-orm/mysql2/migrator";
import { type ConnectionOptions, createConnection } from "mysql2/promise";

/** Resolved relative to this module, not the working directory. */
const MIGRATIONS_FOLDER = join(import.meta.dirname, "../../drizzle");

/**
 * Applies pending migrations from the drizzle/ folder to the database at a
 * `mysql://` URL, or the one in mysql2's connection options. Edit
 * src/db/schema.ts, then run `pnpm db:generate` to write the next migration.
 *
 * Runs on Node, from `mise run db:migrate` and the tests' global setup, with
 * mysql2 connecting straight to TiDB. Never when the server starts.
 */
export async function migrate(database: string | ConnectionOptions): Promise<void> {
  const connection = await createConnection(
    typeof database === "string" ? { uri: database } : database,
  );
  try {
    await runMigrations(drizzle({ client: connection }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await connection.end();
  }
}
