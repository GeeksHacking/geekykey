import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { onTestFinished, test, vi } from "vitest";
import { setupFixture, testApp, testDb, TEST_EVENT_SERVICE_KEY } from "../test-helpers.ts";
import { stations, taps } from "./schema.ts";

// The Event side's hand-off, as the GeekyKey side sends it: the API
// agreement's 11.2.

const app = testApp();

/** A hand-off to the Event side, with the Event Service key unless told otherwise. */
function handOff(body: unknown, authorization: string | null = `Bearer ${TEST_EVENT_SERVICE_KEY}`) {
  return app.request("/geekykey/v1/taps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  });
}

test("a hand-off without the Event Service key, or with another, is refused", async () => {
  const { stationId, userId } = await setupFixture();
  const body = {
    station_id: stationId,
    taps: [{ client_tap_id: "t1", user_id: userId, tapped_at: null }],
  };
  for (const authorization of [
    null,
    "",
    `Bearer ${"6".repeat(64)}`,
    `Basic ${TEST_EVENT_SERVICE_KEY}`,
    `Bearer ${TEST_EVENT_SERVICE_KEY} extra`,
  ]) {
    const res = await handOff(body, authorization);
    assert.equal(res.status, 401, `${authorization}`);
    assert.deepEqual(await res.json(), { error: "invalid_event_service_key" });
  }
});

/** Each stored tap's station, client_tap_id, user, token UID and status, oldest first. */
function storedTaps() {
  return testDb()
    .select({
      station: taps.stationId,
      id: taps.clientTapId,
      user: taps.userId,
      uid: taps.tokenUid,
      status: taps.status,
    })
    .from(taps)
    .orderBy(taps.id);
}

test("a tap is accepted, a resend duplicate, and a second tap cooldown", async () => {
  const { stationId, userId } = await setupFixture();
  const tap = (id: string) => ({ client_tap_id: id, user_id: userId, tapped_at: null });

  const answers = [];
  for (const id of ["t1", "t1", "t2"]) {
    const res = await handOff({ station_id: stationId, taps: [tap(id)] });
    assert.equal(res.status, 200);
    answers.push(await res.json());
  }
  assert.deepEqual(answers, [
    { results: [{ client_tap_id: "t1", status: "accepted" }] },
    { results: [{ client_tap_id: "t1", status: "duplicate" }] },
    { results: [{ client_tap_id: "t2", status: "cooldown" }] },
  ]);
  // With its user ID, and no token UID: the Event side never sees a token.
  assert.deepEqual(await storedTaps(), [
    { station: stationId, id: "t1", user: userId, uid: null, status: "accepted" },
    { station: stationId, id: "t2", user: userId, uid: null, status: "cooldown" },
  ]);
});

test("a tap by someone who has never logged in is still stored", async () => {
  const { stationId } = await setupFixture();
  const res = await handOff({
    station_id: stationId,
    taps: [{ client_tap_id: "t1", user_id: "never-logged-in", tapped_at: null }],
  });
  assert.deepEqual(await res.json(), { results: [{ client_tap_id: "t1", status: "accepted" }] });
  assert.deepEqual(
    (await storedTaps()).map((t) => t.user),
    ["never-logged-in"],
  );
});

test("a body the schema rejects is a 400, and nothing is stored", async () => {
  const { stationId, userId } = await setupFixture();
  const tap = { client_tap_id: "t1", user_id: userId, tapped_at: null };
  for (const body of [
    {},
    { station_id: stationId, taps: [] },
    // A token's UID has no place in a hand-off, and a user ID must be there.
    {
      station_id: stationId,
      taps: [{ client_tap_id: "t1", uid: "04A1B2C3D4E5F6", tapped_at: null }],
    },
    // The GeekyKey side sends UTC with milliseconds.
    { station_id: stationId, taps: [{ ...tap, tapped_at: "2026-10-10T09:00:00+08:00" }] },
  ]) {
    const res = await handOff(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
  assert.deepEqual(await storedTaps(), []);
});

test("taps for a station that isn't this Event Service's are a 400, and nothing is stored", async () => {
  const { userId } = await setupFixture();
  const res = await handOff({
    station_id: "someone-elses-station",
    taps: [{ client_tap_id: "t1", user_id: userId, tapped_at: null }],
  });
  assert.equal(res.status, 400);
  const { error, issues } = (await res.json()) as { error: string; issues: { path: string[] }[] };
  assert.equal(error, "validation_failed");
  assert.deepEqual(issues[0]!.path, ["station_id"]);
  assert.deepEqual(await storedTaps(), []);
});

test("each hand-off sets when the station was last seen", async () => {
  const { stationId, userId } = await setupFixture();
  const lastSeen = async () =>
    (
      await testDb()
        .select({ at: stations.lastSeenAt })
        .from(stations)
        .where(eq(stations.id, stationId))
    )[0]!.at;
  assert.equal(await lastSeen(), null);

  const before = new Date().toISOString();
  // Even a resend, which stores nothing, means the station was heard from.
  for (let i = 0; i < 2; i++) {
    await handOff({
      station_id: stationId,
      taps: [{ client_tap_id: "t1", user_id: userId, tapped_at: null }],
    });
  }
  assert.ok((await lastSeen())! >= before);
});

test("each stored tap gets a tap_stored line, and a duplicate none", async () => {
  const { stationId, userId } = await setupFixture();
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());

  const tappedAt = new Date().toISOString();
  await handOff({
    station_id: stationId,
    taps: [
      { client_tap_id: "t1", user_id: userId, tapped_at: tappedAt },
      { client_tap_id: "t2", user_id: userId, tapped_at: null },
      { client_tap_id: "t1", user_id: userId, tapped_at: tappedAt },
    ],
  });
  const lines = logged.mock.calls.map(([line]) => JSON.parse(line as string));
  assert.deepEqual(lines, [
    {
      severity: "INFO",
      message: "tap_stored",
      station_id: stationId,
      client_tap_id: "t1",
      user_id: userId,
      tapped_at: tappedAt,
      status: "accepted",
    },
    {
      severity: "INFO",
      message: "tap_stored",
      station_id: stationId,
      client_tap_id: "t2",
      user_id: userId,
      tapped_at: null,
      status: "cooldown",
    },
  ]);
});
