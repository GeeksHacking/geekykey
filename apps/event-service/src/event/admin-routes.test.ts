import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { onTestFinished, test, vi } from "vitest";
import { TEST_EVENT_SERVICE_KEY, testApp, testDb } from "../test-helpers.ts";
import { type NewTap, passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** The clock the board reads in these tests. */
const NOW = "2026-10-10T09:01:00.000Z";

/** NOW, `seconds` earlier. */
const secondsBefore = (seconds: number) => new Date(Date.parse(NOW) - seconds * 1000).toISOString();

/**
 * The Event screens' own check of the board (apps/event-web), so the two can't
 * drift apart. Imported by a path tsc doesn't follow, since the screens' code
 * is checked with their settings, not the service's.
 */
const SCREENS_SCHEMAS = fileURLToPath(
  new URL("../../../event-web/src/api/schemas.ts", import.meta.url),
);
const { eventStationBoardResponseSchema } = (await import(/* @vite-ignore */ SCREENS_SCHEMAS)) as {
  eventStationBoardResponseSchema: { parse(input: unknown): unknown };
};

/** GET /api/v1/admin/stations, in the shape section 9.2 of API-AGREEMENT.md agrees. */
interface BoardBody {
  stations: {
    id: string;
    label: string;
    created_at: string;
    disabled_at: string | null;
    passport: { name: string; location: string | null; points: number; added_at: string } | null;
    last_seen_at: string | null;
    online: boolean;
    firmware_version: string | null;
    buffered_taps: number | null;
    reader_ok: boolean | null;
    last_tap_at: string | null;
  }[];
}

/**
 * Every test goes through GET /api/v1/admin/stations, the station board's
 * call (the API agreement's 9.2). Stations, their passport settings and their
 * taps are written straight into the tables, so these tests depend only on
 * what is stored, not on how the hand-off stored it.
 */
async function harness() {
  const app = testApp({}, { now: () => new Date(NOW) });
  const db = testDb();
  // Dev-login signs in only someone who has logged in to this event before.
  await db.insert(users).values([
    { id: ORGANIZER, displayName: "Olive" },
    { id: PARTICIPANT, displayName: "Alex" },
  ]);

  /** Signs in through dev-login and returns the cookie a browser would send back. */
  const signIn = async (userId: string): Promise<string> => {
    const login = await app.request("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    assert.equal(login.status, 204);
    return (login.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };

  const getBoard = (cookie?: string) =>
    app.request("/api/v1/admin/stations", { headers: cookie ? { Cookie: cookie } : {} });

  /** The board as an organizer sees it, which must be a 200 the screens can read. */
  const board = async (): Promise<BoardBody> => {
    const res = await getBoard(await signIn(ORGANIZER));
    assert.equal(res.status, 200);
    const body: unknown = await res.json();
    eventStationBoardResponseSchema.parse(body);
    return body as BoardBody;
  };

  /** Registers a station, enabled and never heard from unless told otherwise. */
  const addStation = (id: string, station: Partial<typeof stations.$inferInsert> = {}) =>
    db.insert(stations).values({
      id,
      label: `Reader ${id}`,
      apiKeyHash: `unused-${id}`,
      createdAt: "2026-10-01T02:00:00.000Z",
      ...station,
    });

  let tapCount = 0;
  /** Stores a tap at `stationId`: accepted, NFC, by the participant, unless told otherwise. */
  const addTap = (stationId: string, tap: Partial<NewTap> & Pick<NewTap, "receivedAt">) =>
    db.insert(taps).values({
      stationId,
      clientTapId: `tap-${++tapCount}`,
      userId: PARTICIPANT,
      status: "accepted",
      source: "nfc",
      ...tap,
    });

  /** POST to an organizer endpoint, with a JSON body when there is one. */
  const post = (path: string, cookie: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** The registered stations, as the GeekyKey Service fetches them (11.1). */
  const registered = async (): Promise<RegisteredStation[]> => {
    const res = await app.request("/geekykey/v1/stations", {
      headers: { Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}` },
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { stations: RegisteredStation[] }).stations;
  };

  return { db, signIn, getBoard, board, addStation, addTap, post, registered };
}

/** Catches every log line the test's requests write, as parsed JSON. */
function captureLogs(): () => Record<string, unknown>[] {
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

/** One of the registered stations, as GET /geekykey/v1/stations lists it (11.1). */
interface RegisteredStation {
  station_id: string;
  key_hash: string;
}

/** A station key's hash, as the GeekyKey Service computes it (the API agreement's 11.1). */
const sha256 = (key: string) => createHash("sha256").update(key).digest("hex");

/** POST /api/v1/admin/stations and /{id}/key answer the station as the board lists it, and its key. */
interface StationKeyBody {
  station: BoardBody["stations"][number];
  api_key: string;
}

test("answers unauthenticated when nobody is signed in", async () => {
  const { getBoard } = await harness();
  const res = await getBoard();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("answers forbidden to a participant", async () => {
  const { getBoard, signIn } = await harness();
  const res = await getBoard(await signIn(PARTICIPANT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("lists a station with its passport settings, its health and its last tap", async () => {
  const { db, board, addStation, addTap } = await harness();
  await addStation("station-3", {
    label: "Reader 3",
    lastSeenAt: secondsBefore(59),
    firmwareVersion: "0.3.1",
    bufferedTaps: 0,
    readerOk: true,
  });
  await db.insert(passportStations).values({
    stationId: "station-3",
    name: "3D Printing Booth",
    location: "Hall A",
    points: 2,
    addedAt: "2026-10-02T03:00:00.000Z",
  });
  await addTap("station-3", { receivedAt: "2026-10-10T08:58:12.004Z" });

  assert.deepEqual(await board(), {
    stations: [
      {
        id: "station-3",
        label: "Reader 3",
        created_at: "2026-10-01T02:00:00.000Z",
        disabled_at: null,
        passport: {
          name: "3D Printing Booth",
          location: "Hall A",
          points: 2,
          added_at: "2026-10-02T03:00:00.000Z",
        },
        last_seen_at: "2026-10-10T09:00:01.000Z",
        online: true,
        firmware_version: "0.3.1",
        buffered_taps: 0,
        reader_ok: true,
        last_tap_at: "2026-10-10T08:58:12.004Z",
      },
    ],
  });
});

test("a station is online only when it was heard from less than 120 seconds ago", async () => {
  const { board, addStation } = await harness();
  await addStation("heard-119s-ago", { lastSeenAt: secondsBefore(119) });
  await addStation("heard-120s-ago", { lastSeenAt: secondsBefore(120) });
  await addStation("never-heard-from");

  const online = Object.fromEntries((await board()).stations.map((s) => [s.id, s.online]));
  assert.deepEqual(online, {
    "heard-119s-ago": true,
    "heard-120s-ago": false,
    "never-heard-from": false,
  });
});

test("a station outside the passport and never heard from has nulls, not zeros", async () => {
  const { board, addStation } = await harness();
  await addStation("station-new");
  const [station] = (await board()).stations;
  assert.deepEqual(station, {
    id: "station-new",
    label: "Reader station-new",
    created_at: "2026-10-01T02:00:00.000Z",
    disabled_at: null,
    passport: null,
    last_seen_at: null,
    online: false,
    firmware_version: null,
    buffered_taps: null,
    reader_ok: null,
    last_tap_at: null,
  });
});

test("a disabled station is still listed, with when it was disabled", async () => {
  const { board, addStation } = await harness();
  await addStation("station-lost", { disabledAt: "2026-10-10T08:30:00.000Z" });
  await addStation("station-kept");
  const disabled = Object.fromEntries((await board()).stations.map((s) => [s.id, s.disabled_at]));
  assert.deepEqual(disabled, {
    "station-lost": "2026-10-10T08:30:00.000Z",
    "station-kept": null,
  });
});

test("the last tap is the newest stored tap from the station, whatever its status", async () => {
  const { board, addStation, addTap } = await harness();
  await addStation("station-a");
  await addStation("station-b");
  await addTap("station-a", { receivedAt: "2026-10-10T08:00:00.000Z" });
  await addTap("station-a", { receivedAt: "2026-10-10T08:20:00.000Z", status: "cooldown" });
  await addTap("station-a", { receivedAt: "2026-10-10T08:10:00.000Z" });
  await addTap("station-b", { receivedAt: "2026-10-10T08:05:00.000Z", status: "no_game" });
  // Logged by an organizer, not sent by the station, so a dead reader still looks quiet.
  await addTap("station-a", { receivedAt: "2026-10-10T08:30:00.000Z", source: "qr_fallback" });

  const lastTaps = Object.fromEntries((await board()).stations.map((s) => [s.id, s.last_tap_at]));
  assert.deepEqual(lastTaps, {
    "station-a": "2026-10-10T08:20:00.000Z",
    "station-b": "2026-10-10T08:05:00.000Z",
  });
});

test("stations are listed in the order they were created", async () => {
  const { board, addStation } = await harness();
  // Not the order of their IDs, nor of their rows.
  await addStation("station-a", { createdAt: "2026-10-02T00:00:00.000Z" });
  await addStation("station-b", { createdAt: "2026-10-01T00:00:00.000Z" });
  const ids = (await board()).stations.map((s) => s.id);
  assert.deepEqual(ids, ["station-b", "station-a"]);
});

test("an organizer creates a station, sees its key once, and its key's hash is registered", async () => {
  const { signIn, post, registered } = await harness();
  const res = await post("/api/v1/admin/stations", await signIn(ORGANIZER), { label: "Reader 3" });
  assert.equal(res.status, 201);
  const body = (await res.json()) as StationKeyBody;
  eventStationBoardResponseSchema.parse({ stations: [body.station] });

  assert.match(body.api_key, /^gk_sta_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(body.station, {
    id: body.station.id,
    label: "Reader 3",
    created_at: body.station.created_at,
    disabled_at: null,
    passport: null,
    last_seen_at: null,
    online: false,
    firmware_version: null,
    buffered_taps: null,
    reader_ok: null,
    last_tap_at: null,
  });
  assert.deepEqual(await registered(), [
    { station_id: body.station.id, key_hash: sha256(body.api_key) },
  ]);
});

test("creating a station logs who made it, and the key is never stored, logged or shown again", async () => {
  const { db, signIn, post, getBoard } = await harness();
  const cookie = await signIn(ORGANIZER);
  const logs = captureLogs();
  const res = await post("/api/v1/admin/stations", cookie, { label: "Reader 3" });
  const { station, api_key } = (await res.json()) as StationKeyBody;

  assert.deepEqual(logs(), [
    { severity: "INFO", message: "station_created", user_id: ORGANIZER, station_id: station.id },
  ]);
  const [row] = await db.select().from(stations);
  assert.ok(!JSON.stringify(row).includes(api_key), "the stored row holds the key");
  const board = await (await getBoard(cookie)).text();
  assert.ok(board.includes(station.id));
  assert.ok(!board.includes(api_key), "the board shows the key");
});

test("replacing a station's key keeps its ID and settings, and registers only the new key's hash", async () => {
  const { db, signIn, post, registered, board } = await harness();
  const cookie = await signIn(ORGANIZER);
  const created = (await (
    await post("/api/v1/admin/stations", cookie, { label: "Reader 3" })
  ).json()) as StationKeyBody;
  await db.insert(passportStations).values({
    stationId: created.station.id,
    name: "3D Printing Booth",
    addedAt: "2026-10-02T03:00:00.000Z",
  });
  const before = (await board()).stations[0];

  const logs = captureLogs();
  const res = await post(`/api/v1/admin/stations/${created.station.id}/key`, cookie);
  assert.equal(res.status, 200);
  const replaced = (await res.json()) as StationKeyBody;
  eventStationBoardResponseSchema.parse({ stations: [replaced.station] });

  assert.match(replaced.api_key, /^gk_sta_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(replaced.api_key, created.api_key);
  assert.deepEqual(replaced.station, before);
  assert.deepEqual(await registered(), [
    { station_id: created.station.id, key_hash: sha256(replaced.api_key) },
  ]);
  assert.deepEqual(logs(), [
    {
      severity: "INFO",
      message: "station_key_replaced",
      user_id: ORGANIZER,
      station_id: created.station.id,
    },
  ]);
});

test("a participant can neither create a station nor replace its key", async () => {
  const { signIn, post, addStation, registered } = await harness();
  await addStation("station-3");
  const cookie = await signIn(PARTICIPANT);
  for (const res of [
    await post("/api/v1/admin/stations", cookie, { label: "Reader 3" }),
    await post("/api/v1/admin/stations/station-3/key", cookie),
  ]) {
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  }
  assert.deepEqual(await registered(), [{ station_id: "station-3", key_hash: "unused-station-3" }]);
});

test("replacing the key of a station this Event Service didn't register answers not_found", async () => {
  const { signIn, post } = await harness();
  const logs = captureLogs();
  const res = await post("/api/v1/admin/stations/no-such-station/key", await signIn(ORGANIZER));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.deepEqual(logs(), []);
});

test("a label is trimmed, and must then be 1 to 80 characters", async () => {
  const { signIn, post, registered } = await harness();
  const cookie = await signIn(ORGANIZER);
  for (const body of [
    {},
    { label: "" },
    { label: "   " },
    { label: "x".repeat(81) },
    { label: 3 },
  ]) {
    const res = await post("/api/v1/admin/stations", cookie, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const answer = (await res.json()) as { error: string; issues: { path: string[] }[] };
    assert.equal(answer.error, "validation_failed");
    assert.deepEqual(
      answer.issues.map((i) => i.path),
      [["label"]],
    );
  }
  assert.deepEqual(await registered(), []);

  // 80 emoji are 160 UTF-16 units, but 80 characters.
  for (const label of ["  Reader 3  ", "🔑".repeat(80)]) {
    const res = await post("/api/v1/admin/stations", cookie, { label });
    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as StationKeyBody).station.label, label.trim());
  }
});

test("replacing a disabled station's key leaves it disabled and off the registered stations", async () => {
  const { signIn, post, addStation, registered } = await harness();
  await addStation("station-lost", { disabledAt: "2026-10-10T08:30:00.000Z" });
  const res = await post("/api/v1/admin/stations/station-lost/key", await signIn(ORGANIZER));
  assert.equal(res.status, 200);
  const { station } = (await res.json()) as StationKeyBody;
  assert.equal(station.disabled_at, "2026-10-10T08:30:00.000Z");
  assert.deepEqual(await registered(), []);
});
