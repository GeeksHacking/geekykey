/**
 * Puts chosen tables back as they are in a copy, and leaves every other table
 * as it is (backup-restore.ts). Rows written to those tables since the copy go.
 * It takes a copy of the database as it is first, into
 * ~/.config/geekykey/copies, so the restore can be undone with another; shows
 * each table's count now and in the copy; and goes on only if you type the
 * database's name.
 *
 * Only Adam runs it on production, from his laptop, with Ethan reading the
 * command first. docs/operations.md, "Copies and restores", says when.
 *
 *   cd apps/event-service
 *   mise exec -- pnpm db:restore ~/.config/geekykey/copies/<file>.json --tables taps,tokens \
 *     --production --env-file ~/.config/geekykey/tidb-migration.env
 *
 * The copy must be of the same database. Staging's env file restores into
 * geekykey_staging. Without --production it restores into geekykey_dev. Those
 * two also take the name from a pipe, for testing. Production's needs a
 * terminal.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin } from "node:process";
import { parseArgs } from "node:util";
import { createConnection } from "mysql2/promise";
import { ask } from "./ask.ts";
import { restoreTables } from "./backup-restore.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tables: { type: "string", multiple: true, default: [] },
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
  },
});

const [file, ...extra] = positionals;
if (file === undefined || extra.length > 0) {
  console.error(
    "Usage: pnpm db:restore <copy file> --tables <name,name...> [--production --env-file <file>]",
  );
  process.exit(1);
}
const tables = values.tables
  .flatMap((list) => list.split(","))
  .map((name) => name.trim())
  .filter(Boolean);

const connection = values.production
  ? await createConnection(migrationLogin(values["env-file"]))
  : await createConnection(localDatabaseUrl("geekykey_dev"));

try {
  const outcome = await restoreTables(connection, {
    file,
    tables,
    copyDir: join(homedir(), ".config", "geekykey", "copies"),
    now: new Date(),
    atTerminal: Boolean(stdin.isTTY),
    typeDatabaseName: ask,
    print: (line) => console.log(line),
  });
  if (outcome !== "restored") process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await connection.end();
}
