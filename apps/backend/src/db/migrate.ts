import { drizzle } from "drizzle-orm/mysql2";
import { migrate as runMigrations } from "drizzle-orm/mysql2/migrator";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";

/** Resolved relative to this module, not the working directory. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Applies pending migrations from the drizzle/ folder to the database at
 * `url`. Edit src/db/schema.ts, then run `pnpm db:generate` to write the next
 * migration.
 *
 * Runs on Node, from `mise run db:migrate` and the tests' global setup, with
 * mysql2 connecting straight to TiDB. Never inside a Worker.
 */
export async function migrate(url: string): Promise<void> {
  const connection = await createConnection(url);
  try {
    await runMigrations(drizzle({ client: connection }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await connection.end();
  }
}
