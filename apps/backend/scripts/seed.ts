/**
 * Local development seed: creates a station, a participant with one paired
 * token, and an organizer, then prints the station key and a curl command to
 * try the tap endpoint. The two user IDs are the ones the frontend's dev-login
 * form offers, so both views can be developed against DEV_AUTH_ENABLED=true.
 *
 *   mise run seed
 *   mise run seed -- --station "Booth 3" --uid 04:A1:B2:C3:D4:E5:F6
 *
 * It writes to geekykey_dev, which `mise run db:up` creates and migrates. Each
 * run adds another station; the users and the token are only added once. It
 * connects straight to TiDB with mysql2.
 */
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { normaliseUid } from "../src/services/identity.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { addParticipant, addStation, addUser } from "./seed-rows.ts";

const { values } = parseArgs({
  options: {
    station: { type: "string", default: "Dev Station" },
    uid: { type: "string", default: "04A1B2C3D4E5F6" },
    // Names match the frontend's mock fixtures so a screen reads the same either way.
    name: { type: "string", default: "Alex Tan" },
    organizer: { type: "string", default: "Priya Raman" },
  },
});

const connection = await createConnection(localDatabaseUrl("geekykey_dev"));
const db = drizzle({ client: connection });

try {
  const station = await addStation(db, values.station);

  const userId = "dev-user-1";
  const uid = normaliseUid(values.uid);
  await addParticipant(db, {
    id: userId,
    portalUserId: "dev-portal-1",
    displayName: values.name,
    uid,
  });

  const organizerId = "dev-organizer-1";
  await addUser(db, {
    id: organizerId,
    portalUserId: "dev-portal-2",
    displayName: values.organizer,
    role: "organizer",
  });

  console.log(`Database:     geekykey_dev`);
  console.log(`Station:      ${values.station} (${station.id})`);
  console.log(`Station key:  ${station.key}   <- shown once, only the hash is stored`);
  console.log(`Participant:  ${values.name} (${userId}) paired to token ${uid}`);
  console.log(`Organizer:    ${values.organizer} (${organizerId})`);
  console.log();
  console.log("Try it:");
  console.log(
    `curl -s -X POST http://localhost:8000/api/v1/taps \\
  -H "Authorization: Bearer ${station.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"taps":[{"client_tap_id":"tap-1","uid":"${uid}"}]}'`,
  );
} finally {
  await connection.end();
}
