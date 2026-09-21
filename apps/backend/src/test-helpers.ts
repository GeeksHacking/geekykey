import { createDb, type Db } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";
import { stations, tokens, users } from "./db/schema.ts";
import { generateStationKey, hashStationKey } from "./lib/station-keys.ts";

export interface TestFixture {
  db: Db;
  stationId: string;
  stationKey: string;
  userId: string;
  /** Normalised UID paired to `userId`. */
  uid: string;
}

/** Fresh in-memory database with one station and one participant holding one token. */
export async function setupFixture(): Promise<TestFixture> {
  const db = createDb(":memory:");
  await migrate(db);

  const stationId = "station-1";
  const stationKey = generateStationKey();
  const userId = "user-1";
  const uid = "04A1B2C3D4E5F6";

  await db.insert(stations).values({
    id: stationId,
    name: "Booth 1",
    apiKeyHash: await hashStationKey(stationKey),
  });
  await db.insert(users).values({ id: userId, displayName: "Alex" });
  await db.insert(tokens).values({ uid, userId });

  return { db, stationId, stationKey, userId, uid };
}

/** Deterministic clock for pipeline tests. */
export function fakeClock(startIso: string) {
  let current = new Date(startIso);
  return {
    now: () => current,
    advanceSeconds(seconds: number) {
      current = new Date(current.getTime() + seconds * 1000);
    },
  };
}
