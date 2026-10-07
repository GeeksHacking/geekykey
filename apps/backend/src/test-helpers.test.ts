import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { test } from "vitest";
import { stations, taps, tokens, users } from "./db/schema.ts";
import { hashStationKey } from "./lib/station-keys.ts";
import { setupFixture, testDb } from "./test-helpers.ts";

test("the fixture's station, participant and token read back through the pool", async () => {
  const { db, stationId, stationKey, userId, uid } = await setupFixture();

  const [station] = await db.select().from(stations).where(eq(stations.id, stationId)).limit(1);
  assert.equal(station?.apiKeyHash, await hashStationKey(stationKey));
  assert.equal(station.points, 1);
  // The code sets timestamps, since the database can't.
  assert.equal(new Date(station.createdAt).toISOString(), station.createdAt);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  assert.equal(user?.role, "participant");

  const [token] = await db.select().from(tokens).where(eq(tokens.uid, uid)).limit(1);
  assert.equal(token?.userId, userId);
  assert.equal(token.revokedAt, null);

  // A tap as well, so the next test can show that taps are emptied too.
  await db.insert(taps).values({
    stationId,
    clientTapId: "t1",
    tokenUid: uid,
    userId,
    status: "accepted",
    receivedAt: new Date().toISOString(),
  });
});

// Runs after the test above, since a file's tests run in order.
test("every test starts with empty tables", async () => {
  const db = testDb();
  for (const [name, table] of Object.entries({ users, tokens, stations, taps })) {
    assert.deepEqual(await db.select().from(table), [], name);
  }
});

test("taps hands out ids in the order taps arrive", async () => {
  const db = testDb();
  // Without AUTO_ID_CACHE=1, each TiDB server hands out ids from its own
  // batch, so a newer tap could get a lower id.
  const [rows] = await db.execute(sql`SHOW CREATE TABLE taps`);
  const [row] = rows as unknown as { "Create Table": string }[];
  assert.match(row!["Create Table"], /AUTO_ID_CACHE=1/);
});
