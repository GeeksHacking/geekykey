import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { onTestFinished, test, vi } from "vitest";
import { TEST_EVENT_SERVICE_KEY, screensSchemas, testApp, testDb } from "../test-helpers.ts";
import { type NewTap, passportStations, stations, taps, users } from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** The clock the board reads in these tests. */
const NOW = "2026-10-10T09:01:00.000Z";

/** NOW, `seconds` earlier. */
const secondsBefore = (seconds: number) => new Date(Date.parse(NOW) - seconds * 1000).toISOString();

const {
  eventStationBoardResponseSchema,
  stationKeyResponseSchema,
  stationResponseSchema,
  setStationPassportResponseSchema,
} = screensSchemas;

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
  const post = (path: string, cookie: string, body?: unknown) => send("POST", path, cookie, body);

  /** PUT a station's passport settings (9.1). */
  const putPassport = (stationId: string, cookie: string, body: unknown) =>
    send("PUT", `/api/v1/admin/stations/${stationId}/passport`, cookie, body);

  /** Calls an organizer endpoint with `cookie`, and a JSON body when there is one. */
  const send = (method: string, path: string, cookie: string, body?: unknown) =>
    app.request(path, {
      method,
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

  return { app, db, signIn, getBoard, board, addStation, addTap, post, putPassport, registered };
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
  stationKeyResponseSchema.parse(body);

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
  stationKeyResponseSchema.parse(replaced);

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

/** POST /api/v1/admin/stations/{id}/disable and /enable answer the station as the board lists it (9.9). */
interface StationBody {
  station: BoardBody["stations"][number];
}

test("disabling a station takes it off the registered stations, and logs who did it", async () => {
  const { db, signIn, post, addStation, addTap, registered, board } = await harness();
  await addStation("station-lost");
  await addStation("station-kept");
  // It keeps its slot in the passport, and its taps.
  await db.insert(passportStations).values({
    stationId: "station-lost",
    name: "3D Printing Booth",
    addedAt: "2026-10-02T03:00:00.000Z",
  });
  await addTap("station-lost", { receivedAt: "2026-10-10T08:58:12.004Z" });
  const boardStation = async (id: string) => (await board()).stations.find((s) => s.id === id);
  const before = await boardStation("station-lost");

  const logs = captureLogs();
  const res = await post("/api/v1/admin/stations/station-lost/disable", await signIn(ORGANIZER));
  assert.equal(res.status, 200);
  const body = (await res.json()) as StationBody;
  stationResponseSchema.parse(body);

  assert.deepEqual(body, { station: { ...before, disabled_at: NOW } });
  assert.deepEqual(await boardStation("station-lost"), body.station);
  assert.deepEqual(await registered(), [
    { station_id: "station-kept", key_hash: "unused-station-kept" },
  ]);
  assert.deepEqual(logs(), [
    {
      severity: "INFO",
      message: "station_disabled",
      user_id: ORGANIZER,
      station_id: "station-lost",
    },
  ]);
});

test("enabling a disabled station puts it back on the registered stations, and logs who did it", async () => {
  const { signIn, post, addStation, registered, board } = await harness();
  await addStation("station-found", { disabledAt: "2026-10-10T08:30:00.000Z" });
  const before = (await board()).stations[0];

  const logs = captureLogs();
  const res = await post("/api/v1/admin/stations/station-found/enable", await signIn(ORGANIZER));
  assert.equal(res.status, 200);
  const body = (await res.json()) as StationBody;
  stationResponseSchema.parse(body);

  assert.deepEqual(body, { station: { ...before, disabled_at: null } });
  assert.deepEqual((await board()).stations[0], body.station);
  assert.deepEqual(await registered(), [
    { station_id: "station-found", key_hash: "unused-station-found" },
  ]);
  assert.deepEqual(logs(), [
    {
      severity: "INFO",
      message: "station_enabled",
      user_id: ORGANIZER,
      station_id: "station-found",
    },
  ]);
});

test("disabling a disabled station, or enabling an enabled one, changes nothing and logs nothing", async () => {
  const { signIn, post, addStation, registered, board } = await harness();
  await addStation("station-lost", { disabledAt: "2026-10-10T08:30:00.000Z" });
  await addStation("station-kept");
  const before = await board();
  const cookie = await signIn(ORGANIZER);

  const logs = captureLogs();
  for (const [path, id] of [
    ["disable", "station-lost"],
    ["enable", "station-kept"],
  ] as const) {
    const res = await post(`/api/v1/admin/stations/${id}/${path}`, cookie);
    assert.equal(res.status, 200, path);
    // A second disable keeps when the station was first disabled.
    const station = before.stations.find((s) => s.id === id);
    assert.deepEqual(await res.json(), { station }, path);
  }
  assert.deepEqual(await board(), before);
  assert.deepEqual(await registered(), [
    { station_id: "station-kept", key_hash: "unused-station-kept" },
  ]);
  assert.deepEqual(logs(), []);
});

test("disabling or enabling a station this Event Service didn't register answers not_found", async () => {
  const { signIn, post } = await harness();
  const cookie = await signIn(ORGANIZER);
  const logs = captureLogs();
  for (const path of ["disable", "enable"]) {
    const res = await post(`/api/v1/admin/stations/no-such-station/${path}`, cookie);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: "not_found" }, path);
  }
  assert.deepEqual(logs(), []);
});

test("a participant, or nobody signed in, can neither disable nor enable a station", async () => {
  const { signIn, post, addStation, registered } = await harness();
  await addStation("station-kept");
  await addStation("station-lost", { disabledAt: "2026-10-10T08:30:00.000Z" });
  const cookie = await signIn(PARTICIPANT);
  const logs = captureLogs();
  for (const [cookieSent, status, error] of [
    [cookie, 403, "forbidden"],
    ["", 401, "unauthenticated"],
  ] as const) {
    for (const res of [
      await post("/api/v1/admin/stations/station-kept/disable", cookieSent),
      await post("/api/v1/admin/stations/station-lost/enable", cookieSent),
    ]) {
      assert.equal(res.status, status);
      assert.deepEqual(await res.json(), { error });
    }
  }
  assert.deepEqual(await registered(), [
    { station_id: "station-kept", key_hash: "unused-station-kept" },
  ]);
  assert.deepEqual(logs(), []);
});

/** PUT /api/v1/admin/stations/{id}/passport, in the shape section 9.1 of API-AGREEMENT.md agrees. */
interface PassportBody {
  passport: {
    station_id: string;
    name: string;
    location: string | null;
    points: number;
    added_at: string;
  };
}

test("an organizer adds a station to the passport, which the board then shows", async () => {
  const { signIn, putPassport, addStation, board } = await harness();
  await addStation("station-3");
  const res = await putPassport("station-3", await signIn(ORGANIZER), {
    name: "3D Printing Booth",
    location: "Hall A",
    points: 2,
  });
  assert.equal(res.status, 201);
  const expected = {
    station_id: "station-3",
    name: "3D Printing Booth",
    location: "Hall A",
    points: 2,
    added_at: NOW,
  };
  const body = (await res.json()) as PassportBody;
  setStationPassportResponseSchema.parse(body);
  assert.deepEqual(body, { passport: expected });
  const { station_id: _, ...onBoard } = expected;
  assert.deepEqual((await board()).stations[0]!.passport, onBoard);
});

test("changing a station's settings answers 200, and keeps when it was added", async () => {
  const { db, signIn, putPassport, addStation, board } = await harness();
  await addStation("station-3");
  await db.insert(passportStations).values({
    stationId: "station-3",
    name: "3D Printing",
    location: "Hall A",
    points: 2,
    addedAt: "2026-10-02T03:00:00.000Z",
  });
  const res = await putPassport("station-3", await signIn(ORGANIZER), {
    name: "3D Printing Booth",
    location: "Hall B",
    points: 3,
  });
  assert.equal(res.status, 200);
  const expected = {
    station_id: "station-3",
    name: "3D Printing Booth",
    location: "Hall B",
    points: 3,
    added_at: "2026-10-02T03:00:00.000Z",
  };
  const body = (await res.json()) as PassportBody;
  setStationPassportResponseSchema.parse(body);
  assert.deepEqual(body, { passport: expected });
  const { station_id: _, ...onBoard } = expected;
  assert.deepEqual((await board()).stations[0]!.passport, onBoard);
});

test("adding a station this Event Service didn't register answers not_found", async () => {
  const { signIn, putPassport } = await harness();
  const res = await putPassport("no-such-station", await signIn(ORGANIZER), {
    name: "3D Printing Booth",
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});

test("a bad passport body answers validation_failed and leaves the station as it was", async () => {
  const { signIn, putPassport, addStation, board } = await harness();
  await addStation("station-3");
  const cookie = await signIn(ORGANIZER);
  for (const [body, field] of [
    [{}, "name"],
    [{ name: "   " }, "name"],
    [{ name: "x".repeat(81) }, "name"],
    [{ name: 3 }, "name"],
    [{ name: "Booth", location: "x".repeat(81) }, "location"],
    [{ name: "Booth", location: 3 }, "location"],
    [{ name: "Booth", points: -1 }, "points"],
    [{ name: "Booth", points: 1.5 }, "points"],
    [{ name: "Booth", points: "1" }, "points"],
    [{ name: "Booth", points: 2 ** 31 }, "points"],
  ] as const) {
    const res = await putPassport("station-3", cookie, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const answer = (await res.json()) as { error: string; issues: { path: string[] }[] };
    assert.equal(answer.error, "validation_failed");
    assert.deepEqual(
      answer.issues.map((issue) => issue.path),
      [[field]],
      JSON.stringify(body),
    );
  }
  assert.equal((await board()).stations[0]!.passport, null);
});

test("a name and a location are trimmed, a blank location is none, and points default to 1", async () => {
  const { signIn, putPassport, addStation } = await harness();
  await addStation("station-3");
  await addStation("station-4");
  await addStation("station-5");
  const cookie = await signIn(ORGANIZER);
  // 80 emoji: 80 code points, though 160 UTF-16 units.
  const longest = "🎉".repeat(80);
  for (const [stationId, body, expected] of [
    ["station-3", { name: "  Booth  ", location: "  " }, { name: "Booth", location: null }],
    [
      "station-4",
      { name: longest, location: ` ${longest} ` },
      { name: longest, location: longest },
    ],
    ["station-5", { name: "Booth", location: null }, { name: "Booth", location: null }],
  ] as const) {
    const res = await putPassport(stationId, cookie, body);
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()) as PassportBody, {
      passport: { station_id: stationId, ...expected, points: 1, added_at: NOW },
    });
  }
});

test("a station added takes the last stamp slot, its next tap is accepted, and earlier no_game taps stay", async () => {
  const { app, db, signIn, putPassport, addStation } = await harness();
  // Named so the IDs, which break a tie in added_at, would put the new station first.
  await addStation("station-b");
  await addStation("station-a");
  await db.insert(passportStations).values({
    stationId: "station-b",
    name: "Robotics",
    addedAt: "2026-10-02T03:00:00.000Z",
  });
  const tapAt = async (stationId: string, clientTapId: string) => {
    const res = await app.request("/geekykey/v1/taps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_EVENT_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        station_id: stationId,
        taps: [{ client_tap_id: clientTapId, user_id: PARTICIPANT, tapped_at: null }],
      }),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { results: { status: string }[] }).results[0]!.status;
  };

  assert.equal(await tapAt("station-a", "before"), "no_game");
  const organizer = await signIn(ORGANIZER);
  assert.equal((await putPassport("station-a", organizer, { name: "3D Printing" })).status, 201);
  assert.equal(await tapAt("station-a", "after"), "accepted");
  // Renaming the first station leaves it first.
  assert.equal((await putPassport("station-b", organizer, { name: "Robotics Lab" })).status, 200);

  const me = await app.request("/api/v1/me", { headers: { Cookie: await signIn(PARTICIPANT) } });
  assert.equal(me.status, 200);
  const { stamps, recent_taps } = (await me.json()) as {
    stamps: { station_id: string; name: string; earned_at: string | null }[];
    recent_taps: { station_id: string; status: string }[];
  };
  assert.deepEqual(
    stamps.map(({ station_id, name, earned_at }) => ({
      station_id,
      name,
      earned: earned_at !== null,
    })),
    [
      { station_id: "station-b", name: "Robotics Lab", earned: false },
      { station_id: "station-a", name: "3D Printing", earned: true },
    ],
  );
  // Newest first.
  assert.deepEqual(
    recent_taps.map(({ station_id, status }) => ({ station_id, status })),
    [
      { station_id: "station-a", status: "accepted" },
      { station_id: "station-a", status: "no_game" },
    ],
  );
});

test("a participant, or nobody signed in, can't change the passport", async () => {
  const { signIn, putPassport, addStation, board } = await harness();
  await addStation("station-3");
  const cookie = await signIn(PARTICIPANT);
  for (const [cookieSent, status, error] of [
    [cookie, 403, "forbidden"],
    ["", 401, "unauthenticated"],
  ] as const) {
    const res = await putPassport("station-3", cookieSent, { name: "Booth" });
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), { error });
  }
  assert.equal((await board()).stations[0]!.passport, null);
});

test("a disabled station can be added to the passport, and stays disabled", async () => {
  const { signIn, putPassport, addStation, board } = await harness();
  await addStation("station-3", { disabledAt: "2026-10-10T08:30:00.000Z" });
  const res = await putPassport("station-3", await signIn(ORGANIZER), { name: "Booth" });
  assert.equal(res.status, 201);
  const [station] = (await board()).stations;
  assert.equal(station!.disabled_at, "2026-10-10T08:30:00.000Z");
  assert.equal(station!.passport?.name, "Booth");
});

test("adding or changing a station's settings logs who did it, and a save that changes nothing logs nothing", async () => {
  const { signIn, putPassport, addStation } = await harness();
  await addStation("station-3");
  const cookie = await signIn(ORGANIZER);
  const logs = captureLogs();
  const settings = { name: "3D Printing Booth", location: "Hall A", points: 2 };
  assert.equal((await putPassport("station-3", cookie, settings)).status, 201);
  assert.equal((await putPassport("station-3", cookie, settings)).status, 200);
  assert.equal((await putPassport("station-3", cookie, { ...settings, points: 3 })).status, 200);
  assert.deepEqual(logs(), [
    {
      severity: "INFO",
      message: "station_added_to_passport",
      user_id: ORGANIZER,
      station_id: "station-3",
    },
    {
      severity: "INFO",
      message: "station_passport_changed",
      user_id: ORGANIZER,
      station_id: "station-3",
    },
  ]);
});
