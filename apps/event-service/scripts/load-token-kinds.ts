/**
 * Loads the token writer's log into the list of token kinds beside the claims
 * stand-in (ADR 0006), so each tap by those tokens hands off their kind.
 *
 *   cd apps/event-service
 *   mise exec -- pnpm db:token-kinds --production --env-file ~/.config/geekykey/tidb-migration.env <log file>...
 *
 * Without --production it loads them into geekykey_dev instead, to try it
 * first. Staging's env file loads them into geekykey_staging.
 *
 * A log is what the token writer printed in the Serial Monitor, pasted into a
 * file as it is (firmware/README.md, "Writing tokens"). Only lines such as
 * `04E45150324189,E` are read: a UID, a comma and one capital letter. The rest
 * is the writer's other output, and is skipped. Where a UID shows up more than
 * once, across all the files in the order given, its last line wins, since the
 * writer rewrote that token with the later kind.
 *
 * A UID already in the list takes the log's kind. A UID not in the log keeps
 * its kind, so each batch's log can be loaded as it comes. Nothing is ever
 * removed from the list.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { tokenKinds } from "../src/claims-stand-in/schema.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";

/** One line of the writer's list, as its README says: a UID in capital hex, a comma, a capital. */
const LIST_LINE = /^((?:[0-9A-F]{2}){4,10}),([A-Z])$/;

/** Rows per insert, well inside what one statement can carry. */
const BATCH = 500;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
  },
});
if (positionals.length === 0) {
  console.error(
    "Name at least one log file: pnpm db:token-kinds [--production --env-file <file>] <log file>...",
  );
  process.exit(1);
}

const kinds = new Map<string, string>();
let skipped = 0;
/** Lines with a comma that still aren't list lines: likely a list line cut or mistyped. */
const suspect: string[] = [];
for (const file of positionals) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = LIST_LINE.exec(line.trim());
    if (match) {
      kinds.set(match[1]!, match[2]!);
    } else if (line.trim() !== "") {
      skipped++;
      if (line.includes(",")) suspect.push(line.trim());
    }
  }
}

const login = values.production ? migrationLogin(values["env-file"]) : undefined;
const connection = login
  ? await createConnection(login)
  : await createConnection(localDatabaseUrl("geekykey_dev"));
const db = drizzle({ client: connection });

try {
  const rows = [...kinds].map(([uid, kind]) => ({ uid, kind }));
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(tokenKinds)
      .values(rows.slice(i, i + BATCH))
      .onDuplicateKeyUpdate({ set: { kind: sql`VALUES(kind)` } });
  }

  const byKind = new Map<string, number>();
  for (const kind of kinds.values()) byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  console.log(`Database:  ${login ? `${login.database} on GeeksHacking's TiDB` : "geekykey_dev"}`);
  console.log(`Loaded:    ${kinds.size} tokens`);
  for (const [kind, count] of [...byKind].sort()) console.log(`  ${kind}: ${count}`);
  console.log(`Skipped:   ${skipped} other lines`);
  for (const line of suspect) console.log(`  not a list line, check it: ${line}`);
} finally {
  await connection.end();
}
