/**
 * Adds a test station to GeeksHacking's cluster, and a test participant
 * holding one token, so the first deploy can try every tap result before the
 * GeekyKey admin screens exist. It prints the station key once, and the
 * token's UID: keep both outside the repo.
 *
 *   cd apps/backend
 *   mise exec -- pnpm db:test-station --production --env-file ~/.config/geekykey/tidb-migration.env
 *
 * Without --production it adds them to geekykey_dev instead, to try it first.
 * Each run adds another station; the participant and their token are only
 * added once. The UID is made up, unless --uid gives a real token's:
 *
 *   mise exec -- pnpm db:test-station --production --env-file <file> --uid 04:A1:B2:C3:D4:E5:F6
 *
 * The login's URL names the database, so staging's file adds them to
 * geekykey_staging instead:
 *
 *   mise exec -- pnpm db:test-station --production --env-file ~/.config/geekykey/tidb-staging-migration.env
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { tokens } from "../src/claims-stand-in/schema.ts";
import { normaliseUid } from "../src/lib/token-uid.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { migrationLogin } from "./production-tidb.ts";
import { addParticipant, addStation } from "./seed-rows.ts";

const { values } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    "env-file": { type: "string" },
    station: { type: "string", default: "Test station" },
    uid: { type: "string" },
  },
});

const login = values.production ? migrationLogin(values["env-file"]) : undefined;
const connection = login
  ? await createConnection(login)
  : await createConnection(localDatabaseUrl("geekykey_dev"));
const db = drizzle({ client: connection });

try {
  const station = await addStation(db, values.station);
  const participant = { id: "test-participant", displayName: "Test participant" };
  const [held] = await db
    .select({ uid: tokens.uid })
    .from(tokens)
    .where(eq(tokens.userId, participant.id))
    .limit(1);
  // Seven bytes starting 04, the shape of an NTAG213's UID.
  const uid = normaliseUid(values.uid ?? held?.uid ?? `04${randomBytes(6).toString("hex")}`);
  await addParticipant(db, { ...participant, uid });

  console.log(
    `Database:     ${login ? `${login.database} on GeeksHacking's TiDB` : "geekykey_dev"}`,
  );
  console.log(`Station:      ${values.station} (${station.id})`);
  console.log(`Station key:  ${station.key}   <- shown once, only the hash is stored`);
  console.log(`Participant:  ${participant.displayName} (${participant.id}), holding token ${uid}`);
  console.log();
  console.log("Keep the key and the UID outside the repo.");
} finally {
  await connection.end();
}
