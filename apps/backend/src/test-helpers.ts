import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { onTestFinished } from "vitest";
import { createRequestDb, type Db } from "./db/hyperdrive.ts";
import { stations, tokens, users } from "./db/schema.ts";
import { generateStationKey, hashStationKey } from "./lib/station-keys.ts";
import type { createWorkerApp } from "./worker.ts";

export interface TestFixture {
  db: Db;
  stationId: string;
  stationKey: string;
  userId: string;
  /** Normalised UID paired to `userId`. */
  uid: string;
}

/**
 * geekykey_test through the Hyperdrive binding, as a Worker's request sees
 * its database. The connection closes when the test ends. Every table starts
 * the test empty (test-support/empty-tables.ts).
 */
export function testDb(): Db {
  const { db, close } = createRequestDb(env.HYPERDRIVE);
  onTestFinished(close);
  return db;
}

/**
 * Sends a request to a Worker a test started itself, such as one with other
 * settings, the way `exports.default.fetch` sends one to the tests' own
 * Worker. Waits for what the request left running, such as closing its
 * database connection.
 */
export async function requestWorker(
  worker: ReturnType<typeof createWorkerApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
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
