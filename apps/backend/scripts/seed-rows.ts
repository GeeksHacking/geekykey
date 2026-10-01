/**
 * Rows the seed adds to geekykey_dev, which create-test-station.ts also adds
 * to production. Both connect straight to TiDB with mysql2.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../src/db/hyperdrive.ts";
import { stations, tokens, users } from "../src/db/schema.ts";
import { generateStationKey, hashStationKey } from "../src/lib/station-keys.ts";

/**
 * Adds a station with a new key. The key is handed back to be shown once:
 * only its hash is stored.
 */
export async function addStation(db: Db, name: string): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const key = generateStationKey();
  await db.insert(stations).values({ id, name, apiKeyHash: await hashStationKey(key) });
  return { id, key };
}

/**
 * Adds a participant holding one token. Either is left alone if it's already
 * there. `uid` must already be normalised.
 */
export async function addParticipant(
  db: Db,
  participant: { id: string; portalUserId?: string; displayName: string; uid: string },
): Promise<void> {
  const { id, portalUserId, displayName, uid } = participant;
  await addUser(db, { id, portalUserId, displayName });
  // "Add it unless it's already there" is an update that changes nothing,
  // never INSERT IGNORE, which also turns bad values into warnings and stores them.
  await db
    .insert(tokens)
    .values({ uid, userId: id })
    .onDuplicateKeyUpdate({ set: { uid: sql`uid` } });
}

/** Adds a user, unless they're already there. */
export async function addUser(db: Db, user: typeof users.$inferInsert): Promise<void> {
  await db
    .insert(users)
    .values(user)
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}
