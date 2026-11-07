import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { getTableName } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, onTestFinished, test } from "vitest";
import { tokenKinds } from "../src/claims-stand-in/schema.ts";
import {
  eventSettings,
  groupAllocation,
  groupMembers,
  participantGroups,
  taps,
  usedLoginLinks,
  userKinds,
  users,
} from "../src/event/schema.ts";
import { answers, connections, meetingHalves } from "../src/games/connections/schema.ts";
import {
  screensSchemas,
  setupFixture,
  TEST_FIREBASE_PROJECT_ID,
  testApp,
  testDb,
} from "../src/test-helpers.ts";
import { clearedTables, keptTables } from "./clear-lists.ts";
import { type ClearOptions, clearEvent } from "./event-clear.ts";
import { localDatabaseUrl } from "./local-tidb.ts";

const AT = "2026-11-12T12:00:00.000Z";

let connection: Connection;

beforeAll(async () => {
  connection = await createConnection(localDatabaseUrl("geekykey_test"));
});

afterAll(async () => {
  await connection.end();
});

/** A row in every table the lists name, as after a real session. */
async function fillEveryTable() {
  const db = testDb();
  const { stationId, userId } = await setupFixture();
  const other = "user-2";
  await db.insert(taps).values({
    stationId,
    clientTapId: "tap-1",
    userId,
    status: "accepted",
    receivedAt: AT,
  });
  await db.insert(userKinds).values({ userId, kind: "E" });
  await db.insert(answers).values({ userId, choices: { q1: "a" } });
  await db.insert(meetingHalves).values({ userA: userId, userB: other, aMetAt: AT });
  await db.insert(connections).values({
    userA: userId,
    userB: other,
    connectedAt: AT,
    shared: ["q1"],
  });
  await db.insert(participantGroups).values({
    id: "group-1",
    name: "Group 1",
    tags: [],
    createdAt: AT,
  });
  await db.insert(groupMembers).values({ userId, groupId: "group-1", joinedAt: AT });
  await db.insert(groupAllocation).values({ id: 1, startedAt: AT });
  await db.insert(tokenKinds).values({ uid: "04A1B2C3D4E5F6", kind: "E" });
  await db.insert(usedLoginLinks).values({ jti: "a".repeat(32), expiresAt: AT });
  await db.insert(eventSettings).values({ id: 1, connectAcross: "groups" });
}

/** How many rows each table holds. */
async function rowCounts(tables: readonly MySqlTable[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const name = getTableName(table);
    const [rows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM ??", [name]);
    counts[name] = Number(rows[0]!.n);
  }
  return counts;
}

/** A folder for this test's copies, removed when the test ends. */
async function copyDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "geekykey-clear-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** The clear of geekykey_test, answering with the right name unless a test says otherwise. */
async function clear(overrides: Partial<ClearOptions> = {}) {
  const printed: string[] = [];
  const outcome = clearEvent(connection, {
    copyDir: await copyDir(),
    now: new Date(AT),
    typeDatabaseName: async () => "geekykey_test",
    print: (line) => printed.push(line),
    ...overrides,
  });
  return { outcome, printed };
}

test("the right name empties the tables on the cleared list and keeps those on the kept list", async () => {
  await fillEveryTable();
  const keptBefore = await rowCounts(keptTables);
  // A table added to a list has to get a row above, or this test proves nothing about it.
  for (const [name, count] of Object.entries({
    ...(await rowCounts(clearedTables)),
    ...keptBefore,
  })) {
    assert.ok(count > 0, `${name} has no row to clear or keep`);
  }

  const { outcome } = await clear();
  assert.equal(await outcome, "cleared");

  for (const [name, count] of Object.entries(await rowCounts(clearedTables))) {
    assert.equal(count, 0, `${name} should be empty`);
  }
  assert.deepEqual(await rowCounts(keptTables), keptBefore);
});

test("a wrong database name changes nothing", async () => {
  await fillEveryTable();
  const before = await rowCounts([...clearedTables, ...keptTables]);

  for (const typed of ["geekykey", "GEEKYKEY_TEST", "geekykey_test ", ""]) {
    const { outcome, printed } = await clear({ typeDatabaseName: async () => typed });
    assert.equal(await outcome, "not_confirmed");
    assert.ok(printed.some((line) => line.includes("Nothing was emptied")));
  }

  assert.deepEqual(await rowCounts([...clearedTables, ...keptTables]), before);
});

test("a write while the name is being typed stops the clear, since the copy doesn't hold it", async () => {
  await fillEveryTable();
  const { outcome, printed } = await clear({
    typeDatabaseName: async () => {
      await testDb().insert(users).values({ id: "just-logged-in", displayName: "Guest" });
      return "geekykey_test";
    },
  });
  assert.equal(await outcome, "changed_since_copy");
  assert.ok(printed.some((line) => line.includes("Nothing was emptied")));

  const counts = await rowCounts(clearedTables);
  assert.equal(counts.users, 2);
  assert.equal(counts.taps, 1);
});

test("the counts are shown before anyone is asked, and again after the clear", async () => {
  await fillEveryTable();
  const askedAfter: string[] = [];
  const { outcome, printed } = await clear({
    typeDatabaseName: async () => {
      askedAfter.push(printed.join("\n"));
      return "geekykey_test";
    },
  });
  assert.equal(await outcome, "cleared");

  assert.match(askedAfter[0]!, /taps\s+1\n/);
  assert.match(askedAfter[0]!, /users\s+1\n/);
  assert.match(askedAfter[0]!, /stations\s+1\n/);
  const afterwards = printed.join("\n").slice(askedAfter[0]!.length);
  assert.match(afterwards, /taps\s+0\n/);
  assert.match(afterwards, /tokens\s+0\n/);
  assert.match(afterwards, /users\s+0\n/);
  assert.match(afterwards, /stations\s+1\n/);
  assert.match(afterwards, /Cleared: 0 taps, 0 claims and 0 users/);
});

test("a table on neither list stops the clear before anything changes", async () => {
  await fillEveryTable();
  const before = await rowCounts([...clearedTables, ...keptTables]);
  await connection.query("CREATE TABLE a_new_games_records (id INT PRIMARY KEY)");
  onTestFinished(async () => {
    await connection.query("DROP TABLE a_new_games_records");
  });

  const { outcome } = await clear({
    typeDatabaseName: async () => assert.fail("asked for the name with an unlisted table"),
  });
  await assert.rejects(outcome, /a_new_games_records/);

  assert.deepEqual(await rowCounts([...clearedTables, ...keptTables]), before);
});

test("everyone logs in afresh after the clear, and a name used before is free again", async () => {
  const google = await fakeGoogle(TEST_FIREBASE_PROJECT_ID);
  const app = testApp({}, { googleKeys: google.keys });
  /** POST /auth/firebase, giving back the cookie a browser would send. */
  const logIn = async (sub: string) => {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await google.signIdToken({ sub }) }),
    });
    assert.equal(res.status, 204);
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  };
  const getMe = (cookie: string) => app.request("/api/v1/me", { headers: { Cookie: cookie } });
  const setName = (cookie: string, name: string) =>
    app.request("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ display_name: name }),
    });

  const before = await logIn("first-session-guest");
  assert.equal((await setName(before, "Mei Lin")).status, 200);
  assert.equal((await setName(await logIn("second-session-guest"), "Mei Lin")).status, 409);

  const { outcome } = await clear();
  assert.equal(await outcome, "cleared");

  // The cookie still has a good signature, but its user is gone.
  assert.equal((await getMe(before)).status, 401);
  // Someone else takes the name, and the one who had it starts over, with no name.
  const after = await logIn("second-session-guest");
  assert.equal((await setName(after, "Mei Lin")).status, 200);
  const returning = await getMe(await logIn("first-session-guest"));
  assert.equal(returning.status, 200);
  const body = await returning.json();
  screensSchemas.meResponseSchema.parse(body);
  assert.equal((body as { user: { has_name: boolean } }).user.has_name, false);
});

test("if the copy fails, nothing is emptied and nobody is asked", async () => {
  await fillEveryTable();
  const before = await rowCounts([...clearedTables, ...keptTables]);
  // A file where the copies' folder should be, so the copy can't be written.
  const notAFolder = join(await copyDir(), "not-a-folder");
  await writeFile(notAFolder, "");

  const { outcome } = await clear({
    copyDir: notAFolder,
    typeDatabaseName: async () => assert.fail("asked for the name after a failed copy"),
  });
  await assert.rejects(outcome, /nothing was emptied/i);

  assert.deepEqual(await rowCounts([...clearedTables, ...keptTables]), before);
});

test("the copy holds every table's rows from before the clear, readable only by its owner", async () => {
  await fillEveryTable();
  const dir = await copyDir();

  const { outcome } = await clear({ copyDir: dir });
  assert.equal(await outcome, "cleared");

  const [file, ...others] = await readdir(dir);
  assert.deepEqual(others, []);
  assert.equal(file, "geekykey_test-2026-11-12T12-00-00.000Z.json");
  const path = join(dir, file!);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const copy = JSON.parse(await readFile(path, "utf8"));
  assert.equal(copy.database, "geekykey_test");
  assert.equal(copy.taken_at, AT);
  assert.deepEqual(
    Object.keys(copy.tables)
      .filter((name) => name !== "__drizzle_migrations")
      .sort(),
    [...clearedTables, ...keptTables].map((table) => getTableName(table)).sort(),
  );
  assert.equal(copy.tables.taps[0].client_tap_id, "tap-1");
  assert.equal(copy.tables.users[0].id, "user-1");
  assert.deepEqual(copy.tables.answers[0].choices, { q1: "a" });
  assert.equal(copy.tables.stations[0].id, "station-1");
});
