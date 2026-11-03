/**
 * Runs once per `vitest run`, before any test file: brings geekykey_test up
 * to date, so a new migration needs no `db:reset` before the tests see it.
 * A migration edited after it ran here does, and stops the run first.
 */
import { localDatabaseUrl } from "../scripts/local-tidb.ts";
import { migrate, refuseChangedMigrations } from "../src/db/migrate.ts";

export default async function migrateTestDatabase(): Promise<void> {
  await refuseChangedMigrations(localDatabaseUrl("geekykey_test"));
  await migrate(localDatabaseUrl("geekykey_test"));
}
