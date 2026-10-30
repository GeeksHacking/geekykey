import assert from "node:assert/strict";
import { test } from "vitest";
import { passportStations, stations, users } from "../../event/schema.ts";
import { setupFixture, testApp, testDb, TEST_EVENT_SERVICE_KEY } from "../../test-helpers.ts";

// The passport's lines on the station's screen, through the hand-off the
// GeekyKey Service sends (the API agreement's 6.1 and 11.2).

const app = testApp();

interface Result {
  client_tap_id: string;
  status: string;
  lines?: string[];
  complete?: boolean;
}

/** One hand-off of `taps` at `stationId`, and its results. */
async function handOff(
  stationId: string,
  taps: { client_tap_id: string; user_id: string; tapped_at?: string | null }[],
): Promise<Result[]> {
  const res = await app.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      station_id: stationId,
      taps: taps.map((tap) => ({ tapped_at: null, ...tap })),
    }),
  });
  assert.equal(res.status, 200);
  const { results } = (await res.json()) as { results: Result[] };
  for (const { lines = [] } of results) {
    for (const line of lines) assert.match(line, /^[\x20-\x7E]{0,16}$/, line);
  }
  return results;
}

/**
 * setupFixture's station, and `more` stations after it that run the passport
 * with settings, so the passport has `1 + more` stamp slots. Gives every
 * station's ID, the fixture's first.
 */
async function passportOf(more: number) {
  const fixture = await setupFixture();
  const ids = [fixture.stationId];
  for (let n = 2; n <= more + 1; n++) {
    const id = `station-${n}`;
    await testDb()
      .insert(stations)
      .values({ id, label: `Reader ${n}`, apiKeyHash: String(n).repeat(64), game: "passport" });
    await testDb()
      .insert(passportStations)
      .values({ stationId: id, name: `Booth ${n}` });
    ids.push(id);
  }
  return { ...fixture, ids };
}

test("an accepted passport tap gives the visitor's name and progress, and that it counted", async () => {
  const { ids, userId } = await passportOf(2);
  assert.deepEqual(await handOff(ids[0]!, [{ client_tap_id: "t1", user_id: userId }]), [
    { client_tap_id: "t1", status: "accepted", lines: ["Alex: 1 of 3", "Tap counted!"] },
  ]);
});

/** An ISO time `minutes` before now, as a station's own tapped_at. */
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");

test("each tap that earns a stamp counts it, and the last stamp finishes the passport", async () => {
  const { ids, userId } = await passportOf(2);
  const tap = (client_tap_id: string) => [{ client_tap_id, user_id: userId }];
  assert.deepEqual(
    [
      ...(await handOff(ids[0]!, tap("t1"))),
      ...(await handOff(ids[1]!, tap("t2"))),
      ...(await handOff(ids[2]!, tap("t3"))),
    ],
    [
      { client_tap_id: "t1", status: "accepted", lines: ["Alex: 1 of 3", "Tap counted!"] },
      { client_tap_id: "t2", status: "accepted", lines: ["Alex: 2 of 3", "Tap counted!"] },
      {
        client_tap_id: "t3",
        status: "accepted",
        lines: ["Alex: 3 of 3", "All 3 done!"],
        complete: true,
      },
    ],
  );
});

test("a tap the cooldown holds back gives the progress, and that it was already counted", async () => {
  const { ids, userId } = await passportOf(2);
  await handOff(ids[0]!, [{ client_tap_id: "t1", user_id: userId }]);
  assert.deepEqual(await handOff(ids[0]!, [{ client_tap_id: "t2", user_id: userId }]), [
    { client_tap_id: "t2", status: "cooldown", lines: ["Alex: 1 of 3", "Already counted"] },
  ]);
});

test("only the tap that earns the last stamp finishes the passport, not a later one", async () => {
  const { ids, userId } = await passportOf(1);
  await handOff(ids[0]!, [{ client_tap_id: "t1", user_id: userId, tapped_at: minutesAgo(60) }]);
  await handOff(ids[1]!, [{ client_tap_id: "t2", user_id: userId, tapped_at: minutesAgo(50) }]);
  // Both stamps are earned, so tapping again after the cooldown earns points, not a stamp.
  assert.deepEqual(await handOff(ids[0]!, [{ client_tap_id: "t3", user_id: userId }]), [
    { client_tap_id: "t3", status: "accepted", lines: ["Alex: 2 of 2", "Tap counted!"] },
  ]);
});

test("saved taps sent together each get their lines, and only the first counted one finishes", async () => {
  const { ids, userId } = await passportOf(1);
  await handOff(ids[0]!, [{ client_tap_id: "t1", user_id: userId, tapped_at: minutesAgo(60) }]);
  const results = await handOff(ids[1]!, [
    // Sent in another order than they were made, as a station's saved taps may be.
    { client_tap_id: "later", user_id: userId, tapped_at: minutesAgo(10) },
    { client_tap_id: "earlier", user_id: userId, tapped_at: minutesAgo(30) },
    { client_tap_id: "held", user_id: userId, tapped_at: minutesAgo(29) },
  ]);
  assert.deepEqual(results, [
    { client_tap_id: "later", status: "accepted", lines: ["Alex: 2 of 2", "Tap counted!"] },
    {
      client_tap_id: "earlier",
      status: "accepted",
      lines: ["Alex: 2 of 2", "All 2 done!"],
      complete: true,
    },
    { client_tap_id: "held", status: "cooldown", lines: ["Alex: 2 of 2", "Already counted"] },
  ]);
});

test("a stamp at a station that doesn't run the passport isn't counted, and nor is the station", async () => {
  const { ids, userId } = await passportOf(1);
  await testDb()
    .insert(stations)
    .values({ id: "elsewhere", label: "Reader 9", apiKeyHash: "9".repeat(64) });
  await testDb().insert(passportStations).values({ stationId: "elsewhere", name: "Booth 9" });
  await handOff("elsewhere", [{ client_tap_id: "t1", user_id: userId }]);
  assert.deepEqual(await handOff(ids[0]!, [{ client_tap_id: "t2", user_id: userId }]), [
    { client_tap_id: "t2", status: "accepted", lines: ["Alex: 1 of 2", "Tap counted!"] },
  ]);
});

test("unknown taps carry neither field: no_game, and a duplicate of a counted tap", async () => {
  const { ids, userId } = await passportOf(0);
  await testDb()
    .insert(stations)
    .values({ id: "no-game", label: "Reader 9", apiKeyHash: "9".repeat(64) });
  assert.deepEqual(await handOff("no-game", [{ client_tap_id: "t1", user_id: userId }]), [
    { client_tap_id: "t1", status: "no_game" },
  ]);
  await handOff(ids[0]!, [{ client_tap_id: "t2", user_id: userId }]);
  assert.deepEqual(await handOff(ids[0]!, [{ client_tap_id: "t2", user_id: userId }]), [
    { client_tap_id: "t2", status: "duplicate" },
  ]);
});

test("the station greets a visitor by the first word of their own name, as much as fits", async () => {
  const { ids } = await passportOf(1);
  const setAt = "2026-10-30T01:00:00.000Z";
  await testDb()
    .insert(users)
    .values([
      // Neither the login nor they gave a name, so it's the default.
      { id: "guest", displayName: "Guest" },
      // They chose it, so it's theirs.
      { id: "chose-guest", displayName: "Guest", nameSetAt: setAt },
      { id: "accents", displayName: "  José María", nameSetAt: setAt },
      { id: "long", displayName: "Bartholomew Lee" },
      { id: "chinese", displayName: "李明" },
      { id: "emoji", displayName: "Sam🙂 Tan" },
    ]);
  const visitors = [
    "never-logged-in",
    "guest",
    "chose-guest",
    "accents",
    "long",
    "chinese",
    "emoji",
  ];
  const results = await handOff(
    ids[0]!,
    visitors.map((user_id) => ({ client_tap_id: user_id, user_id })),
  );
  assert.deepEqual(
    results.map((result) => [result.client_tap_id, result.lines?.[0]]),
    [
      ["never-logged-in", "1 of 2 stamps"],
      ["guest", "1 of 2 stamps"],
      ["chose-guest", "Guest: 1 of 2"],
      ["accents", "Jose: 1 of 2"],
      ["long", "Bartholo: 1 of 2"],
      ["chinese", "1 of 2 stamps"],
      ["emoji", "1 of 2 stamps"],
    ],
  );
});
