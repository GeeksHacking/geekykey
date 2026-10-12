import { afterAll } from "vitest";
import { localDatabaseUrl } from "../scripts/local-tidb.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDbPool, type Db } from "./db/pool.ts";
import { tokens } from "./claims-stand-in/schema.ts";
import { stations, users } from "./event/schema.ts";
import { generateStationKey, hashStationKey } from "./geekykey/station-keys.ts";

export interface TestFixture {
  db: Db;
  stationId: string;
  stationKey: string;
  userId: string;
  /** Normalised UID paired to `userId`. */
  uid: string;
}

/** One pool to geekykey_test for each test file, closed once its tests are done. */
const testPool = createDbPool(localDatabaseUrl("geekykey_test"));
afterAll(testPool.close);

/**
 * geekykey_test, through a pool like the server's. Every table starts each
 * test empty (test-support/empty-tables.ts).
 */
export function testDb(): Db {
  return testPool.db;
}

/**
 * The backend as `pnpm dev` starts it, with dev-login on, but against
 * geekykey_test. `settings` are added to, or replace, its environment
 * variables. Send it a request with `app.request(path, init)`.
 */
export function testApp(settings: Record<string, string> = {}) {
  const config = loadConfig({
    DATABASE_URL: localDatabaseUrl("geekykey_test"),
    DEV_AUTH_ENABLED: "true",
    ...settings,
  });
  return createApp(config, testDb());
}

/** One station, and one participant holding one token. */
export async function setupFixture(): Promise<TestFixture> {
  const db = testDb();

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
