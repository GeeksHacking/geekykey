import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("a tap at a station without passport settings is stored and answered no_game", async () => {
  const { userId } = await setupFixture();
  await testDb()
    .insert(stations)
    .values({ id: "station-2", label: "Reader 2", apiKeyHash: "b".repeat(64) });
  const res = await handOff({
    station_id: "station-2",
    taps: [{ client_tap_id: "t1", user_id: userId, tapped_at: null }],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { results: [{ client_tap_id: "t1", status: "no_game" }] });
  assert.deepEqual(await storedTaps(), [
    { station: "station-2", id: "t1", user: userId, uid: null, status: "no_game" },
  ]);
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

// The registered stations, as the GeekyKey side asks for them: the API
// agreement's 11.1.

/** This Event Service's registered stations, asked for with the Event Service key unless told otherwise. */
function registeredStations(authorization: string | null = `Bearer ${TEST_EVENT_SERVICE_KEY}`) {
  return app.request("/geekykey/v1/stations", {
    headers: authorization === null ? {} : { Authorization: authorization },
  });
}

test("the registered stations without the Event Service key, or with another, are refused", async () => {
  await setupFixture();
  for (const authorization of [null, `Bearer ${"6".repeat(64)}`]) {
    const res = await registeredStations(authorization);
    assert.equal(res.status, 401, `${authorization}`);
    assert.deepEqual(await res.json(), { error: "invalid_event_service_key" });
  }
});

test("the registered stations are the enabled ones, each with its key's hash and nothing else", async () => {
  const { stationId, stationKey } = await setupFixture();
  await testDb()
    .insert(stations)
    .values({
      id: "station-disabled",
      label: "Reader 2",
      apiKeyHash: "a".repeat(64),
      disabledAt: "2026-10-14T01:00:00.000Z",
    });

  const res = await registeredStations();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    stations: [
      { station_id: stationId, key_hash: createHash("sha256").update(stationKey).digest("hex") },
    ],
  });
});

// The heartbeat hand-off, as the GeekyKey side sends it: the API agreement's
// 11.3.

/** A heartbeat hand-off to the Event side, with the Event Service key unless told otherwise. */
function handOffHeartbeat(
  body: unknown,
  authorization: string | null = `Bearer ${TEST_EVENT_SERVICE_KEY}`,
) {
  return app.request("/geekykey/v1/heartbeats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  });
}

/** What the station board will show of a station's health. */
async function health(stationId: string) {
  const [row] = await testDb()
    .select({
      lastSeenAt: stations.lastSeenAt,
      firmwareVersion: stations.firmwareVersion,
      bufferedTaps: stations.bufferedTaps,
      readerOk: stations.readerOk,
    })
    .from(stations)
    .where(eq(stations.id, stationId));
  return row!;
}

test("a heartbeat hand-off without the Event Service key, or with another, is refused", async () => {
  const { stationId } = await setupFixture();
  for (const authorization of [null, `Bearer ${"6".repeat(64)}`]) {
    const res = await handOffHeartbeat({ station_id: stationId }, authorization);
    assert.equal(res.status, 401, `${authorization}`);
    assert.deepEqual(await res.json(), { error: "invalid_event_service_key" });
  }
  assert.equal((await health(stationId)).lastSeenAt, null);
});

test("a heartbeat hand-off is answered 204 and stores the station's health", async () => {
  const { stationId } = await setupFixture();
  const before = new Date().toISOString();
  const res = await handOffHeartbeat({
    station_id: stationId,
    firmware_version: "0.3.1",
    buffered_taps: 4,
    reader_ok: false,
  });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  const { lastSeenAt, ...rest } = await health(stationId);
  assert.ok(lastSeenAt! >= before, `${lastSeenAt}`);
  assert.deepEqual(rest, { firmwareVersion: "0.3.1", bufferedTaps: 4, readerOk: false });
});

test("a field the station left out keeps what the last heartbeat said", async () => {
  const { stationId } = await setupFixture();
  await handOffHeartbeat({
    station_id: stationId,
    firmware_version: "0.3.1",
    buffered_taps: 4,
    reader_ok: true,
  });
  const res = await handOffHeartbeat({ station_id: stationId, buffered_taps: 0 });
  assert.equal(res.status, 204);
  const { lastSeenAt: _, ...rest } = await health(stationId);
  assert.deepEqual(rest, { firmwareVersion: "0.3.1", bufferedTaps: 0, readerOk: true });
});

test("a heartbeat hand-off the schema rejects is a 400, and nothing is stored", async () => {
  const { stationId } = await setupFixture();
  for (const body of [
    {},
    { station_id: stationId, buffered_taps: -1 },
    { station_id: stationId, firmware_version: "1".repeat(65) },
    { station_id: stationId, reader_ok: "yes" },
  ]) {
    const res = await handOffHeartbeat(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
  assert.equal((await health(stationId)).lastSeenAt, null);
});

test("a heartbeat for a station that isn't this Event Service's is a 400", async () => {
  await setupFixture();
  const res = await handOffHeartbeat({ station_id: "someone-elses-station", reader_ok: true });
  assert.equal(res.status, 400);
  const { error, issues } = (await res.json()) as { error: string; issues: { path: string[] }[] };
  assert.equal(error, "validation_failed");
  assert.deepEqual(issues[0]!.path, ["station_id"]);
});
