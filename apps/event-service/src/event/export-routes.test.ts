import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { tokens } from "../claims-stand-in/schema.ts";
import { testApp, testDb } from "../test-helpers.ts";
import {
  type NewTap,
  PASSPORT_GAME_ID,
  passportStations,
  stations,
  taps,
  users,
} from "./schema.ts";

/** The organizer testApp() starts with, as `pnpm dev` does. */
const ORGANIZER = "dev-organizer-1";
const PARTICIPANT = "user-1";

/** The export's first line: the API agreement's ten columns, in order (9.6). */
const HEADER =
  "tap_id,client_tap_id,station_id,station_name,user_id,display_name,status,source,tapped_at,received_at";

/**
 * The Event screens' own list of the columns (apps/event-web), so the two can't
 * drift apart. Imported by a path tsc doesn't follow, since the screens' code
 * is checked with their settings, not the service's.
 */
const SCREENS_TYPES = fileURLToPath(
  new URL("../../../event-web/src/api/types.ts", import.meta.url),
);
const { EXPORT_CSV_COLUMNS } = (await import(/* @vite-ignore */ SCREENS_TYPES)) as {
  EXPORT_CSV_COLUMNS: readonly string[];
};

/**
 * Every test goes through GET /api/v1/admin/export.csv, the A/B analysis's
 * data feed (the API agreement's 9.6). Stations, users and taps are written
 * straight into the tables, so these tests depend only on what is stored.
 */
async function harness() {
  const app = testApp();
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

  /** GET /api/v1/admin/export.csv as `cookie`'s user. */
  const getExport = (cookie: string) =>
    app.request("/api/v1/admin/export.csv", { headers: { Cookie: cookie } });

  /** The export's lines as an organizer downloads it, which must be a 200. */
  const exportLines = async (): Promise<string[]> => {
    const res = await getExport(await signIn(ORGANIZER));
    assert.equal(res.status, 200);
    const csv = await res.text();
    assert.ok(csv.endsWith("\r\n"), "the last line ends like the others");
    return csv.slice(0, -2).split("\r\n");
  };

  /** Registers a station, outside the passport unless given a passport name. */
  const addStation = async (
    id: string,
    passportName?: string,
    game: string | null = passportName ? PASSPORT_GAME_ID : null,
  ) => {
    await db.insert(stations).values({
      id,
      label: `Reader ${id}`,
      apiKeyHash: `unused-${id}`,
      game,
    });
    if (passportName)
      await db.insert(passportStations).values({ stationId: id, name: passportName });
  };

  let tapCount = 0;
  /** Stores a tap at `stationId`: accepted, NFC, by the participant, unless told otherwise. Returns its ID. */
  const addTap = async (stationId: string, tap: Partial<NewTap> = {}): Promise<number> => {
    tapCount++;
    const [{ id }] = await db
      .insert(taps)
      .values({
        stationId,
        clientTapId: `tap-${tapCount}`,
        userId: PARTICIPANT,
        status: "accepted",
        source: "nfc",
        receivedAt: new Date(Date.UTC(2026, 9, 10, 9, 0, tapCount)).toISOString(),
        ...tap,
      })
      .$returningId();
    return id;
  };

  return { db, signIn, getExport, exportLines, addStation, addTap };
}

test("answers forbidden to a participant", async () => {
  const { getExport, signIn } = await harness();
  const res = await getExport(await signIn(PARTICIPANT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});

test("downloads a CSV file with the agreement's ten columns and one row per tap", async () => {
  const { signIn, getExport, addStation, addTap } = await harness();
  await addStation("station-3", "3D Printing Booth");
  const id = await addTap("station-3", {
    clientTapId: "tap-000123",
    tappedAt: "2026-10-10T09:00:00.000Z",
    receivedAt: "2026-10-10T09:00:01.250Z",
  });

  const res = await getExport(await signIn(ORGANIZER));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.match(res.headers.get("Content-Disposition") ?? "", /^attachment\b/);
  assert.equal(
    await res.text(),
    `${HEADER}\r\n` +
      `${id},tap-000123,station-3,3D Printing Booth,${PARTICIPANT},Alex,accepted,nfc,` +
      "2026-10-10T09:00:00.000Z,2026-10-10T09:00:01.250Z\r\n",
  );
});

test("the header is the columns the Event screens expect", async () => {
  const { exportLines } = await harness();
  assert.equal((await exportLines())[0], EXPORT_CSV_COLUMNS.join(","));
});

test("a value with a comma, a quote or a line break is quoted, with its quotes doubled", async () => {
  const { db, exportLines, addStation, addTap } = await harness();
  await addStation("station-3", 'Booth "3", Hall A');
  await db.insert(users).values([
    { id: "user-quote", displayName: 'Sam "the" Tapper' },
    { id: "user-newline", displayName: "Two\nLines" },
    { id: "user-return", displayName: "Carriage\rReturn" },
  ]);
  const quote = await addTap("station-3", {
    userId: "user-quote",
    receivedAt: "2026-10-10T09:00:01.000Z",
  });
  const newline = await addTap("station-3", {
    userId: "user-newline",
    receivedAt: "2026-10-10T09:00:02.000Z",
  });
  const carriage = await addTap("station-3", {
    userId: "user-return",
    receivedAt: "2026-10-10T09:00:03.000Z",
  });

  // Split on CRLF only, so the newline inside a quoted name stays in its row.
  assert.deepEqual((await exportLines()).slice(1), [
    `${quote},tap-1,station-3,"Booth ""3"", Hall A",user-quote,"Sam ""the"" Tapper",accepted,nfc,,2026-10-10T09:00:01.000Z`,
    `${newline},tap-2,station-3,"Booth ""3"", Hall A",user-newline,"Two\nLines",accepted,nfc,,2026-10-10T09:00:02.000Z`,
    `${carriage},tap-3,station-3,"Booth ""3"", Hall A",user-return,"Carriage\rReturn",accepted,nfc,,2026-10-10T09:00:03.000Z`,
  ]);
});

test("lists every stored status and both sources, oldest first", async () => {
  const { exportLines, addStation, addTap } = await harness();
  await addStation("station-passport", "3D Printing Booth");
  await addStation("station-outside");
  const accepted = await addTap("station-passport");
  const cooldown = await addTap("station-passport", { status: "cooldown" });
  const noGame = await addTap("station-outside", { status: "no_game" });
  const fallback = await addTap("station-passport", { source: "qr_fallback" });

  const listed = (await exportLines()).slice(1).map((line) => {
    const cells = line.split(",");
    return [Number(cells[0]), cells[6], cells[7]];
  });
  assert.deepEqual(listed, [
    [accepted, "accepted", "nfc"],
    [cooldown, "cooldown", "nfc"],
    [noGame, "no_game", "nfc"],
    [fallback, "accepted", "qr_fallback"],
  ]);
});

test("a station outside the passport, a user new to the event and a missing tapped_at are empty cells", async () => {
  const { exportLines, addStation, addTap } = await harness();
  await addStation("station-outside");
  const id = await addTap("station-outside", {
    userId: "never-logged-in",
    status: "no_game",
    tappedAt: null,
    receivedAt: "2026-10-10T09:00:01.250Z",
  });

  assert.deepEqual((await exportLines()).slice(1), [
    `${id},tap-1,station-outside,,never-logged-in,,no_game,nfc,,2026-10-10T09:00:01.250Z`,
  ]);
});

test("a station running another game has an empty name, even with passport settings", async () => {
  const { exportLines, addStation, addTap } = await harness();
  await addStation("station-other", "Old Booth", "connections");
  const id = await addTap("station-other", {
    tappedAt: null,
    receivedAt: "2026-10-10T09:00:01.250Z",
  });

  assert.equal((await exportLines())[1]!.split(",")[3], "", `tap ${id}`);
});

test("an event with no taps exports the header alone", async () => {
  const { exportLines } = await harness();
  assert.deepEqual(await exportLines(), [HEADER]);
});

test("no token ID appears, even for a token the tap's user has claimed", async () => {
  const { db, getExport, signIn, addStation, addTap } = await harness();
  await db.insert(tokens).values({ uid: "04A1B2C3D4E5F6", userId: PARTICIPANT });
  await addStation("station-3", "3D Printing Booth");
  await addTap("station-3");

  const csv = await (await getExport(await signIn(ORGANIZER))).text();
  assert.doesNotMatch(csv, /04A1B2C3D4E5F6|token/i);
});
