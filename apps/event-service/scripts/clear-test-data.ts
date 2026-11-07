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
 * geekykey_dev, to try it first.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createConnection } from "mysql2/promise";
import { clearEvent } from "./event-clear.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";

const { values } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
  },
});

/** What the person types, or nothing if their input ends first, which stops the clear too. */
async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await Promise.race([
      prompt.question(question),
      new Promise<string>((resolve) => prompt.once("close", () => resolve(""))),
    ]);
  } finally {
    prompt.close();
  }
}

const connection = values.production
  ? await createConnection(migrationLogin(values["env-file"]))
  : await createConnection(localDatabaseUrl("geekykey_dev"));

try {
  const outcome = await clearEvent(connection, {
    copyDir: join(homedir(), ".config", "geekykey", "copies"),
    now: new Date(),
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
