import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate as runMigrations } from "drizzle-orm/mysql2/migrator";
import { type ConnectionOptions, createConnection } from "mysql2/promise";

/** Resolved relative to this module, not the working directory. */
const MIGRATIONS_FOLDER = join(import.meta.dirname, "../../drizzle");

/**
 * Applies pending migrations from the drizzle/ folder, or another folder of
 * them for a test, to the database at a
 * `mysql://` URL, or the one in mysql2's connection options. Edit a schema
 * file, one that drizzle.config.ts lists, then run
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

/**
 * Fails, naming them, when a migration already applied to `database` has
 * changed since, or is gone from the folder. Drizzle's migrator applies only
 * the migrations written after the last one it ran, so an edit to one it has
 * run, or one rewritten under a new name, never reaches the database, and the
 * tests would run against the old tables. Run it before migrate(), on a local
 * database only: the fix it names, `pnpm db:reset`, empties the database.
 */
export async function refuseChangedMigrations(
  database: string | ConnectionOptions,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const files = new Map(
    readMigrationFiles({ migrationsFolder }).map((file) => [file.folderMillis, file.hash]),
  );
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as { entries: { when: number; tag: string }[] };
  const tags = new Map(journal.entries.map((entry) => [entry.when, entry.tag]));

  const connection = await createConnection(
    typeof database === "string" ? { uri: database } : database,
  );
  let applied: { hash: string; created_at: string | number }[];
  try {
    const [rows] = await connection.query("SELECT hash, created_at FROM __drizzle_migrations");
    applied = rows as typeof applied;
  } catch (error) {
    // A database nothing has migrated yet has no record of migrations.
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return;
    throw error;
  } finally {
    await connection.end();
  }

  const changed = applied
    .filter((row) => files.get(Number(row.created_at)) !== row.hash)
    .map(
      (row) =>
        tags.get(Number(row.created_at)) ??
        `the one written at ${new Date(Number(row.created_at)).toISOString()}, now gone`,
    );
  if (changed.length > 0) {
    throw new Error(
      `Migrations changed after they ran here: ${changed.join(", ")}. ` +
        "Run `pnpm db:reset` to rebuild the local databases from drizzle/.",
    );
  }
}
