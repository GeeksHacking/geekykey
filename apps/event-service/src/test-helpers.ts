import { unreachableGoogleKeys } from "@geekykey/firebase-login/testing";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { localDatabaseUrl } from "../scripts/local-tidb.ts";
import { type AppDeps, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDbPool, type Db } from "./db/pool.ts";
import { tokens } from "./claims-stand-in/schema.ts";
import { PASSPORT_GAME_ID, passportStations, stations, users } from "./event/schema.ts";
import { generateStationKey, hashStationKey } from "./event/station-keys.ts";

/** The games testApp() runs, for a test of the base that builds its own TapPipeline. */
export { showcaseGames } from "./showcase/games.ts";

/** One of the Event screens' checks of an answer, from apps/event-web/src/api/schemas.ts. */
export interface ScreensSchema {
  parse(input: unknown): unknown;
}

/**
 * The Event screens' own checks of the organizer answers, so the service and the
 * screens can't drift apart: a route test that parses its answer with one fails
 * when the service sends what the screens would refuse. Imported by a path tsc
 * doesn't follow, since the screens' code is checked with their settings, not
 * the service's.
 */
export const screensSchemas = (await import(
  /* @vite-ignore */ fileURLToPath(new URL("../../event-web/src/api/schemas.ts", import.meta.url))
)) as Record<
  | "eventStationBoardResponseSchema"
  | "stationKeyResponseSchema"
  | "stationResponseSchema"
  | "setStationPassportResponseSchema"
  | "listTapsResponseSchema"
  | "fallbackTapResponseSchema"
  | "statsResponseSchema",
  ScreensSchema
>;

export interface TestFixture {
  db: Db;
  stationId: string;
  stationKey: string;
  userId: string;
  /** Normalised UID claimed by `userId`. */
  uid: string;
}

/** The claims stand-in's key in testApp(), which tests send to its routes. */
export const TEST_CLAIMS_STAND_IN_KEY = "5".repeat(64);

/** The Event Service key in testApp(), which tests send to the Event side's hand-off routes. */
export const TEST_EVENT_SERVICE_KEY = "e".repeat(64);

/** The Firebase project testApp() accepts ID tokens for. */
export const TEST_FIREBASE_PROJECT_ID = "geekykey-test";

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
 * The Event Service as `pnpm dev` starts it, with dev-login on, but against
 * geekykey_test. `settings` are added to, or replace, its environment
 * variables. Send it a request with `app.request(path, init)`.
 *
 * It never fetches Google's keys: a test that logs in with Firebase passes
 * `googleKeys` from fakeGoogle() (@geekykey/firebase-login/testing). A test
 * of the station board's online light pins the clock with `now`.
 */
export function testApp(
  settings: Record<string, string> = {},
  { googleKeys = unreachableGoogleKeys, now }: Partial<AppDeps> = {},
) {
  const config = loadConfig({
    DATABASE_URL: localDatabaseUrl("geekykey_test"),
    DEV_AUTH_ENABLED: "true",
    CLAIMS_STAND_IN_KEY: TEST_CLAIMS_STAND_IN_KEY,
    EVENT_SERVICE_KEY: TEST_EVENT_SERVICE_KEY,
    FIREBASE_PROJECT_ID: TEST_FIREBASE_PROJECT_ID,
    ...settings,
  });
  return createApp(config, testDb(), { googleKeys, now });
}

/** One station running the passport, with its settings, and one participant holding one token. */
export async function setupFixture(): Promise<TestFixture> {
  const db = testDb();

  const stationId = "station-1";
  const stationKey = generateStationKey();
  const userId = "user-1";
  const uid = "04A1B2C3D4E5F6";

  await db.insert(stations).values({
    id: stationId,
    label: "Reader 1",
    apiKeyHash: await hashStationKey(stationKey),
    game: PASSPORT_GAME_ID,
  });
  await db.insert(passportStations).values({ stationId, name: "Booth 1" });
  await db.insert(users).values({ id: userId, displayName: "Alex" });
  await db.insert(tokens).values({ uid, userId });

  return { db, stationId, stationKey, userId, uid };
}

/**
 * Stores who owns a token, as a claim through the claims stand-in would, at
 * a time a test can pin.
 */
export function claimToken(uid: string, userId: string, claimedAt = "2026-10-12T05:00:00.000Z") {
  return testDb().insert(tokens).values({ uid, userId, claimedAt });
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
