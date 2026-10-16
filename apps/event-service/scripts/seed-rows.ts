/**
 * Rows the seed adds to geekykey_dev, which create-test-station.ts also adds
 * to production. Both connect straight to TiDB with mysql2.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../src/db/pool.ts";
import { tokens } from "../src/claims-stand-in/schema.ts";
import { passportStations, stations, users } from "../src/event/schema.ts";
import { generateStationKey, hashStationKey } from "../src/geekykey/station-keys.ts";

/**
 * Adds a station with a new key, named `label`. The key is handed back to be
 * shown once: only its hash is stored. Unless it's `outsidePassport`, the
 * station joins the passport under the same name, worth 1 point a tap;
 * outside it, its taps are `no_game`.
 */
export async function addStation(
  db: Db,
  station: { label: string; outsidePassport?: boolean },
): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const key = generateStationKey();
  await db
    .insert(stations)
    .values({ id, label: station.label, apiKeyHash: await hashStationKey(key) });
  if (!station.outsidePassport) {
    await db.insert(passportStations).values({ stationId: id, name: station.label });
  }
  return { id, key };
}

/**
 * Adds a participant holding one token. Either is left alone if it's already
 * there. `uid` must already be normalised.
 */
export async function addParticipant(
  db: Db,
  participant: { id: string; displayName: string; uid: string },
): Promise<void> {
  const { id, displayName, uid } = participant;
  await addUser(db, { id, displayName });
  // "Add it unless it's already there" is an update that changes nothing,
  // never INSERT IGNORE, which also turns bad values into warnings and stores them.
  await db
    .insert(tokens)
    .values({ uid, userId: id })
    .onDuplicateKeyUpdate({ set: { uid: sql`uid` } });
}

/** Adds a user, unless they're already there. */
export async function addUser(db: Db, user: { id: string; displayName: string }): Promise<void> {
  await db
    .insert(users)
    .values(user)
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}
