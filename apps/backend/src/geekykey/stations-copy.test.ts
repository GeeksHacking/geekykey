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
 * as the GeekyKey side asks: `requests` counts each time.
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

test("a missing list is asked for again, and a key on it found once it comes back", async () => {
  loggedLines();
  const other = eventService("other", down);
  const { find } = copyOf([other]);
  assert.deepEqual(await find(hashOf("b")), { result: "unavailable" });

  other.answer = listOf(["station-2", hashOf("b")]);
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

const MINUTE = 60_000;

test("a copy more than a minute old is used for the request, then refreshed without it waiting", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  // Not yet a minute old: no request.
  time.advance(MINUTE);
  await find(hashOf("a"));
  await settled();
  assert.equal(showcase.requests, 1);

  // Older: the request is answered from the old list while the refresh is still out.
  let answer!: (list: RegisteredStation[]) => void;
  showcase.answer = () => new Promise((resolve) => (answer = resolve));
  time.advance(1);
  const found = await find(hashOf("a"));
  assert.equal(found.result === "found" && found.stationId, "station-1");
  assert.equal(showcase.requests, 2);

  // Once the refresh comes back, its list is the one used.
  answer([{ station_id: "station-1", key_hash: hashOf("c") }]);
  await settled();
  assert.deepEqual(await find(hashOf("a")), { result: "unknown" });
  const replaced = await find(hashOf("c"));
  assert.equal(replaced.result === "found" && replaced.stationId, "station-1");
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

test("an unknown key never causes a refresh", async () => {
  loggedLines();
  const showcase = eventService("showcase", listOf(["station-1", hashOf("a")]));
  const { find, settled, time } = copyOf([showcase]);
  await find(hashOf("a"));

  time.advance(60 * MINUTE);
  for (const char of "bcdef") assert.deepEqual(await find(hashOf(char)), { result: "unknown" });
  await settled();
  assert.equal(showcase.requests, 1);
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
