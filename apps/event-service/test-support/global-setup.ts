/**
 * Runs once per `vitest run`, before any test file. It stops the run if another
 * is using geekykey_test, since every checkout on this machine shares it and two
 * runs empty each other's tables, which looks like a test failing at random.
 * Then it brings the database up to date, so a new migration needs no
 * `db:reset` before the tests see it. A migration edited after it ran here does,
 * and stops the run first.
 */
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { localDatabaseUrl } from "../scripts/local-tidb.ts";
import { migrate, refuseChangedMigrations } from "../src/db/migrate.ts";

/** Held by this connection for the whole run, and let go when the connection closes. */
const RUN_LOCK = "geekykey_test_run";

export default async function prepareTestDatabase(): Promise<() => Promise<void>> {
  const lock = await createConnection(localDatabaseUrl("geekykey_test"));
  try {
    const [rows] = await lock.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS got", [RUN_LOCK]);
    if (rows[0]!.got !== 1) {
      throw new Error(
        "Another test run is using geekykey_test, perhaps from another checkout. " +
          "Wait for it to finish, then run the tests again.",
      );
    }
    await refuseChangedMigrations(localDatabaseUrl("geekykey_test"));
    await migrate(localDatabaseUrl("geekykey_test"));
  } catch (err) {
    await lock.end();
    throw err;
  }
  return () => lock.end();
}
