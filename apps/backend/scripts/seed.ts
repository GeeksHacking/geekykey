/**
 * Local development seed: creates a station, a participant with one paired
 * token, and an organizer, then prints the station key and a curl command to
 * try the tap endpoint. The two user IDs are the ones the frontend's dev-login
 * form offers, so both views can be developed against DEV_AUTH_ENABLED=true.
 *
 *   deno task seed
 *   deno task seed --station "Booth 3" --uid 04:A1:B2:C3:D4:E5:F6
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../src/config.ts";
import { createDb, ensureLocalDbDir } from "../src/db/client.ts";
import { migrate } from "../src/db/migrate.ts";
import { stations, tokens, users } from "../src/db/schema.ts";
import { generateStationKey, hashStationKey } from "../src/lib/station-keys.ts";
import { normaliseUid } from "../src/services/identity.ts";

const { values } = parseArgs({
  args: Deno.args,
  options: {
    station: { type: "string", default: "Dev Station" },
    uid: { type: "string", default: "04A1B2C3D4E5F6" },
    // Names match the frontend's mock fixtures so a screen reads the same either way.
    name: { type: "string", default: "Alex Tan" },
    organizer: { type: "string", default: "Priya Raman" },
  },
});

const config = loadConfig();
await ensureLocalDbDir(config.databaseUrl);
const db = createDb(config.databaseUrl, config.databaseAuthToken);
await migrate(db);

const stationId = crypto.randomUUID();
const stationKey = generateStationKey();
await db.insert(stations).values({
  id: stationId,
  name: values.station,
  apiKeyHash: await hashStationKey(stationKey),
});

const userId = "dev-user-1";
const uid = normaliseUid(values.uid);
await db
  .insert(users)
  .values({
    id: userId,
    portalUserId: "dev-portal-1",
    displayName: values.name,
  })
  .onConflictDoNothing();
await db.insert(tokens).values({ uid, userId }).onConflictDoNothing();

const organizerId = "dev-organizer-1";
await db
  .insert(users)
  .values({
    id: organizerId,
    portalUserId: "dev-portal-2",
    displayName: values.organizer,
    role: "organizer",
  })
  .onConflictDoNothing();

console.log(`Database:     ${config.databaseUrl}`);
console.log(`Station:      ${values.station} (${stationId})`);
console.log(
  `Station key:  ${stationKey}   <- shown once, only the hash is stored`,
);
console.log(`Participant:  ${values.name} (${userId}) paired to token ${uid}`);
console.log(`Organizer:    ${values.organizer} (${organizerId})`);
console.log();
console.log("Try it:");
console.log(`curl -s -X POST http://localhost:${config.port}/api/v1/taps \\
  -H "Authorization: Bearer ${stationKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"taps":[{"client_tap_id":"tap-1","uid":"${uid}"}]}'`);
