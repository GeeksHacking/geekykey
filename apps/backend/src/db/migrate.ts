import { migrate as runMigrations } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.ts";

/** Resolved relative to this module, not the working directory, so it holds inside a container. */
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/**
 * Applies pending migrations from the drizzle/ folder.
 * Edit src/db/schema.ts, then run `deno task db:generate` to produce the next migration.
 */
export async function migrate(db: Db): Promise<void> {
  await runMigrations(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
