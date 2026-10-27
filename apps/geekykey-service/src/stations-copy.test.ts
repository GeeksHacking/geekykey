import assert from "node:assert/strict";
import type { RegisteredStation } from "@geekykey/handoff";
import { onTestFinished, test, vi } from "vitest";
import { EventServiceUnavailable } from "./event-service.ts";
import { StationsCopy } from "./stations-copy.ts";

// The copy of the registered stations (the migration spec's 3.5), with the
// Event Services and the clock faked.

const hashOf = (char: string) => char.repeat(64);

/**
 * A fake Event Service whose registered stations are `answer()`'s, asked for
 * as the Worker asks: `requests` counts each time.
 */
function eventService(id: string, answer: () => Promise<RegisteredStation[]>) {
  const service = {
    id,
    requests: 0,
    answer,
    registeredStations: async () => {
      service.requests++;
      return service.answer();
    },
  };
  return service;
}

const listOf =
  (...stations: [string, string][]) =>
  async () =>
    stations.map(([station_id, key_hash]) => ({ station_id, key_hash }));
const down = async (): Promise<never> => {
  throw new EventServiceUnavailable("status", 503);
};
const never = () => new Promise<never>(() => {});

const MINUTE = 60_000;

/** A clock a test moves on by hand. */
function clock() {
  let now = Date.parse("2026-10-14T01:00:00.000Z");
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

/** Every line logged during this test, each read as one JSON object. */
function loggedLines() {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => {
    logged.mockRestore();
    errors.mockRestore();
  });
  return () =>
    [...logged.mock.calls, ...errors.mock.calls].map(
      ([line]) => JSON.parse(line as string) as Record<string, unknown>,
    );
}

/** A copy of `services`' lists, and what it left running after answering. */
function copyOf(services: ReturnType<typeof eventService>[], time = clock()) {
  const copy = new StationsCopy({ eventServices: services, now: time.now, fetchTimeoutMs: 100 });
  const background: Promise<unknown>[] = [];
  const find = (keyHash: string, signal = AbortSignal.timeout(1000)) =>
    copy.find(keyHash, { signal, waitUntil: (work) => background.push(work) });
  /** Waits for every refresh the copy started after answering. */
  const settled = () => Promise.all(background);
  return { find, settled, time };
}

test("an empty copy is filled on the request path, with one request to each Event Service", async () => {
  const lines = loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const other = eventService("other", listOf(["station-2", hashOf("b")]));
  const { find } = copyOf([showcase, other]);

  assert.deepEqual(await find(hashOf("b")), {
    result: "found",
    stationId: "station-2",
    eventService: other,
  });
  assert.deepEqual([showcase.requests, other.requests], [1, 1]);
  assert.deepEqual(lines(), [
    { severity: "INFO", message: "stations_copy_filled", took_ms: 0, complete: true, missing: [] },
  ]);

  // Filled now, so the next key is checked without asking again.
  const found = await find(hashOf("a"));
  assert.equal(found.result === "found" && found.stationId, "station-1");
  assert.deepEqual([showcase.requests, other.requests], [1, 1]);
});

test("a key on no list is unknown, once every list is in hand", async () => {
  loggedLines();
  const { find } = copyOf([eventService("showcase", listOf(["station-1", hashOf("a")]))]);
  assert.deepEqual(await find(hashOf("f")), { result: "unknown" });
});

test("with a list missing, a key on no other list is unavailable, not unknown", async () => {
  const lines = loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const other = eventService("other", down);
  const { find } = copyOf([showcase, other]);

  // It may be on the missing list.
  assert.deepEqual(await find(hashOf("f")), { result: "unavailable" });
  // A key on a list in hand still works.
  const found = await find(hashOf("a"));
  assert.equal(found.result === "found" && found.stationId, "station-1");

  const logged = lines();
  assert.equal(logged.length, 2);
  const named = (name: string) => logged.find((line) => line.message === name);
  assert.deepEqual(named("stations_unavailable"), {
    severity: "ERROR",
    message: "stations_unavailable",
    event_service: "other",
    reason: "status",
    status: 503,
  });
  assert.deepEqual(named("stations_copy_filled"), {
    severity: "INFO",
    message: "stations_copy_filled",
    took_ms: 0,
    complete: false,
    missing: ["other"],
  });
});

test("keys checked at once while a list is missing share one request for it", async () => {
  loggedLines();
  const other = eventService("other", listOf(["station-2", hashOf("b")]));
  const { find } = copyOf([other]);
  const [found, junk] = await Promise.all([find(hashOf("b")), find(hashOf("f"))]);
  assert.equal(found.result === "found" && found.stationId, "station-2");
  assert.deepEqual(junk, { result: "unknown" });
  assert.equal(other.requests, 1);
});

test("a missing list is asked for again a minute later, whatever the key, and a key on it found once it comes back", async () => {
  loggedLines();
  const other = eventService("other", down);
  const { find, time } = copyOf([other]);
  assert.deepEqual(await find(hashOf("b")), { result: "unavailable" });

  // Within the minute, no key asks again, so junk keys can't make us call it.
  other.answer = listOf(["station-2", hashOf("b")]);
  time.advance(MINUTE);
  for (const char of "bcdef") assert.deepEqual(await find(hashOf(char)), { result: "unavailable" });
  assert.equal(other.requests, 1);

  time.advance(1);
  const found = await find(hashOf("b"));
  assert.equal(found.result === "found" && found.stationId, "station-2");
  assert.equal(other.requests, 2);
});

test("a fill that runs out of the request's time is unavailable, and answers in time", async () => {
  loggedLines();
  const { find } = copyOf([eventService("showcase", never)]);
  const started = Date.now();
  assert.deepEqual(await find(hashOf("a"), AbortSignal.timeout(50)), { result: "unavailable" });
  // The Event Service never answers, so only the request's time ends the wait.
  const took = Date.now() - started;
  assert.ok(took < 500, `took ${took} ms`);
});

test("a list more than a minute old is asked for again before the request is answered, so a disabled station's key is refused at once", async () => {
  loggedLines();
  const showcase = eventService(
    "showcase",
    listOf(["station-1", hashOf("a")], ["station-2", hashOf("b")]),
  );
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  // Not yet a minute old: no request.
  time.advance(MINUTE);
  await find(hashOf("a"));
  await settled();
  assert.equal(showcase.requests, 1);

  // Older, and station-1 is disabled: the request that finds the copy old waits for the new list.
  showcase.answer = listOf(["station-2", hashOf("b")]);
  time.advance(1);
  assert.deepEqual(await find(hashOf("a")), { result: "unknown" });
  assert.equal(showcase.requests, 2);
  const found = await find(hashOf("b"));
  assert.equal(found.result === "found" && found.stationId, "station-2");
  assert.equal(showcase.requests, 2);
});

test("when a refresh fails, the last good list is kept, however old, and the failure logged", async () => {
  const lines = loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  showcase.answer = down;
  for (let i = 0; i < 3; i++) {
    time.advance(24 * 60 * MINUTE);
    const found = await find(hashOf("a"));
    assert.equal(found.result === "found" && found.stationId, "station-1");
    await settled();
  }
  assert.equal(showcase.requests, 4);
  assert.equal(lines().filter((line) => line.message === "stations_unavailable").length, 3);
  // Still a list in hand, so a key on none of them is unknown.
  assert.deepEqual(await find(hashOf("f")), { result: "unknown" });
});

test("a refresh that runs out of the request's time is unavailable, and answers in time, leaving the last good list", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  let fail!: (err: Error) => void;
  showcase.answer = () => new Promise((_, reject) => (fail = reject));
  time.advance(MINUTE + 1);
  // No time is left for the owners and the hand-off, and a key on no list may
  // be on the one still out, so either way the station resends later.
  const started = Date.now();
  const checks = await Promise.all([
    find(hashOf("a"), AbortSignal.timeout(50)),
    find(hashOf("b"), AbortSignal.timeout(50)),
  ]);
  assert.deepEqual(checks, [{ result: "unavailable" }, { result: "unavailable" }]);
  const took = Date.now() - started;
  assert.ok(took < 500, `took ${took} ms`);

  // Once the refresh has failed, the last good list answers until the minute is up.
  fail(new EventServiceUnavailable("timeout"));
  await settled();
  const found = await find(hashOf("a"));
  assert.equal(found.result === "found" && found.stationId, "station-1");
  assert.equal(showcase.requests, 2);
});

test("a failed refresh isn't tried again for a minute", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));
  showcase.answer = down;
  time.advance(MINUTE + 1);
  await find(hashOf("a"));
  await settled();
  time.advance(MINUTE);
  await find(hashOf("a"));
  await settled();
  assert.equal(showcase.requests, 2);
});

test("a request that comes while a list more than a minute old is being asked for waits for the same answer", async () => {
  loggedLines();
  const showcase = eventService(
    "showcase",
    listOf(["station-1", hashOf("a")], ["station-2", hashOf("b")]),
  );
  const { find, time } = copyOf([showcase]);
  await find(hashOf("a"));

  let answer!: (list: RegisteredStation[]) => void;
  showcase.answer = () => new Promise((resolve) => (answer = resolve));
  time.advance(MINUTE + 1);
  const first = find(hashOf("a"));
  const second = find(hashOf("a"));
  answer([{ station_id: "station-2", key_hash: hashOf("b") }]);
  assert.deepEqual(await Promise.all([first, second]), [
    { result: "unknown" },
    { result: "unknown" },
  ]);
  assert.equal(showcase.requests, 2);
});

test("an unknown key waits for a list more than a minute old, so a new station's key works at once", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  // Not yet a minute old: no request, so the new station's key is unknown for now.
  showcase.answer = listOf(["station-1", hashOf("a")], ["station-2", hashOf("b")]);
  time.advance(MINUTE);
  assert.deepEqual(await find(hashOf("b")), { result: "unknown" });
  await settled();
  assert.equal(showcase.requests, 1);

  // Older: the request that finds the copy old waits for the new list, and finds the key.
  time.advance(1);
  const found = await find(hashOf("b"));
  assert.equal(found.result === "found" && found.stationId, "station-2");
  assert.equal(showcase.requests, 2);
});

test("with a list missing, a key on no other list also refreshes the lists in hand, each asked for once", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const other = eventService("other", down);
  const { find, settled, time } = copyOf([showcase, other]);
  await find(hashOf("a"));

  showcase.answer = listOf(["station-1", hashOf("a")], ["station-2", hashOf("b")]);
  time.advance(MINUTE + 1);
  const found = await find(hashOf("b"));
  assert.equal(found.result === "found" && found.stationId, "station-2");
  await settled();
  assert.deepEqual([showcase.requests, other.requests], [2, 2]);
  // The other list is still missing, so a key on neither may be on it.
  assert.deepEqual(await find(hashOf("f")), { result: "unavailable" });
});

test("unknown keys ask an Event Service for its list at most once a minute, so junk keys can't flood it", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  time.advance(60 * MINUTE);
  for (const char of "bcdef") assert.deepEqual(await find(hashOf(char)), { result: "unknown" });
  await settled();
  assert.equal(showcase.requests, 2);
  time.advance(MINUTE);
  for (const char of "bcdef") assert.deepEqual(await find(hashOf(char)), { result: "unknown" });
  await settled();
  assert.equal(showcase.requests, 2);
});

test("a station ID or key hash that appears twice, in one list or in two, is refused and logged", async () => {
  const lines = loggedLines();
  const showcase = eventService(
    "showcase",
    listOf(
      ["station-1", hashOf("a")],
      ["station-2", hashOf("a")],
      ["station-3", hashOf("b")],
      ["station-4", hashOf("c")],
    ),
  );
  const other = eventService(
    "other",
    listOf(["station-3", hashOf("d")], ["station-5", hashOf("e")]),
  );
  const { find } = copyOf([showcase, other]);

  // Every list is in hand, so a refused station's key is unknown.
  for (const char of "abd") assert.deepEqual(await find(hashOf(char)), { result: "unknown" }, char);
  for (const [char, stationId] of [
    ["c", "station-4"],
    ["e", "station-5"],
  ]) {
    const found = await find(hashOf(char!));
    assert.equal(found.result === "found" && found.stationId, stationId);
  }

  const refused = lines()
    .filter((line) => line.message === "station_refused")
    .map(({ event_service, station_id, reason }) => [event_service, station_id, reason]);
  assert.deepEqual(refused.sort(), [
    ["other", "station-3", "duplicate_station_id"],
    ["showcase", "station-1", "duplicate_key_hash"],
    ["showcase", "station-2", "duplicate_key_hash"],
    ["showcase", "station-3", "duplicate_station_id"],
  ]);
  // Never the hash, which is as good as the key for finding a station.
  assert.doesNotMatch(JSON.stringify(lines()), /a{64}/);
});
