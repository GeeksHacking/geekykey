/**
 * Empties one database's event data and keeps its settings (event-clear.ts,
 * and clear-lists.ts for which tables). It takes a copy first, into
 * ~/.config/geekykey/copies, shows the row counts, and goes on only if you type
 * the database's name. Everyone logs in afresh afterwards, and names are free
 * again.
 *
 * Only Adam runs it on production, from his laptop, once every station shows 0
 * saved taps on the station board. The README's "Clearing an event's data"
 * says when.
 *
 *   cd apps/event-service
 *   mise exec -- pnpm db:clear-test-data --production --env-file ~/.config/geekykey/tidb-migration.env
 *
 * Staging's env file clears geekykey_staging. Without --production it clears
 * geekykey_dev, to try it first. Those two also take the name from a pipe, for
 * testing. Production's needs a terminal.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin } from "node:process";
import { parseArgs } from "node:util";
import { createConnection } from "mysql2/promise";
import { ask } from "./ask.ts";
import { clearEvent } from "./event-clear.ts";
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
  const outcome = await clearEvent(connection, {
    copyDir: join(homedir(), ".config", "geekykey", "copies"),
    now: new Date(),
    atTerminal: Boolean(stdin.isTTY),
    typeDatabaseName: ask,
    print: (line) => console.log(line),
  });
  if (outcome !== "cleared") process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await connection.end();
}
