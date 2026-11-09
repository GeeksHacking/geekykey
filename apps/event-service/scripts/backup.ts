/**
 * Writes a copy of one database, every table, the claims stand-in's included,
 * to ~/.config/geekykey/copies, and prints each table's row count
 * (backup-restore.ts). It changes nothing in the database.
 *
 * Adam takes one before a migration merges and at the end of an event day.
 * docs/operations.md, "Copies and restores", says when.
 *
 *   cd apps/event-service
 *   mise exec -- pnpm db:backup --production --env-file ~/.config/geekykey/tidb-migration.env
 *
 * Staging's env file copies geekykey_staging. Without --production it copies
 * geekykey_dev.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createConnection } from "mysql2/promise";
import { backUp } from "./backup-restore.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";

const { values } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
  },
});

const connection = values.production
  ? await createConnection(migrationLogin(values["env-file"]))
  : await createConnection(localDatabaseUrl("geekykey_dev"));

try {
  await backUp(connection, {
    copyDir: join(homedir(), ".config", "geekykey", "copies"),
    now: new Date(),
    print: (line) => console.log(line),
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await connection.end();
}
