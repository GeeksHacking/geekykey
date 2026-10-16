/**
 * Local development seed: creates a station in the passport, a participant
 * with one claimed token, and an organizer, then prints the station key and a
 * curl command to try the tap endpoint. The two user IDs are the ones the
 * frontend's dev-login form offers, so both views can be developed against
 * DEV_AUTH_ENABLED=true. The organizer is one because dev-organizer-1 is on
 * the local organizer list (src/config.ts), not because of anything stored.
 *
 *   mise run seed
 *   mise run seed -- --station "Booth 3" --uid 04:A1:B2:C3:D4:E5:F6
 *
 * --outside-passport adds a station no game counts, whose taps are no_game:
 *
 *   mise run seed -- --station "Reader 9" --outside-passport
 *
 * It writes to geekykey_dev, which `mise run db:up` creates and migrates. Each
 * run adds another station; the users and the token are only added once. It
 * connects straight to TiDB with mysql2.
 */
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { normaliseUid } from "../src/lib/token-uid.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { addParticipant, addStation, addUser } from "./seed-rows.ts";

const { values } = parseArgs({
  options: {
    station: { type: "string", default: "Dev Station" },
    "outside-passport": { type: "boolean", default: false },
    uid: { type: "string", default: "04A1B2C3D4E5F6" },
    // Names match the frontend's mock fixtures so a screen reads the same either way.
    name: { type: "string", default: "Alex Tan" },
    organizer: { type: "string", default: "Priya Raman" },
  },
});

const connection = await createConnection(localDatabaseUrl("geekykey_dev"));
const db = drizzle({ client: connection });

try {
  const station = await addStation(db, {
    label: values.station,
    outsidePassport: values["outside-passport"],
  });

  const userId = "dev-user-1";
  const uid = normaliseUid(values.uid);
  await addParticipant(db, { id: userId, displayName: values.name, uid });

  const organizerId = "dev-organizer-1";
  await addUser(db, { id: organizerId, displayName: values.organizer });

  console.log(`Database:     geekykey_dev`);
  console.log(
    `Station:      ${values.station} (${station.id}), ${values["outside-passport"] ? "outside" : "in"} the passport`,
  );
  console.log(`Station key:  ${station.key}   <- shown once, only the hash is stored`);
  console.log(`Participant:  ${values.name} (${userId}), owner of token ${uid}`);
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
