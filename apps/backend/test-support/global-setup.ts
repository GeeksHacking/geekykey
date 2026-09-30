/**
 * Runs once per `vitest run`, on Node rather than inside workerd, before any
 * test file: brings geekykey_test up to date, so a new migration needs no
 * `db:reset` before the tests see it.
 */
import { localDatabaseUrl } from "../scripts/local-tidb.ts";
import { migrate } from "../src/db/migrate.ts";

export default async function migrateTestDatabase(): Promise<void> {
  await migrate(localDatabaseUrl("geekykey_test"));
}
