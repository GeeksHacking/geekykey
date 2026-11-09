import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, onTestFinished, test } from "vitest";
import { tokens } from "../src/claims-stand-in/schema.ts";
import { stations, taps } from "../src/event/schema.ts";
import { testDb } from "../src/test-helpers.ts";
import { fillEveryTable } from "../test-support/fill-every-table.ts";
import { backUp, type RestoreOptions, restoreTables } from "./backup-restore.ts";
import { clearedTables, keptTables } from "./clear-lists.ts";
import type { Copy } from "./database-copy.ts";
import { LOCAL_ROOT, localDatabaseUrl } from "./local-tidb.ts";

/**
 * Every table the migrations make, but their own record, in the lists' order:
 * taps and passport_stations before the stations they point at.
 */
const EVERY_TABLE = [...clearedTables, ...keptTables].map((table) => getTableName(table));

const BACKED_UP_AT = "2026-11-17T10:00:00.000Z";
const RESTORED_AT = "2026-11-17T14:00:00.000Z";

let connection: Connection;

beforeAll(async () => {
  connection = await createConnection(localDatabaseUrl("geekykey_test"));
});

afterAll(async () => {
  await connection.end();
});

/** A folder for this test's copies, removed when the test ends. */
async function copyDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "geekykey-copies-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Every row in `table`, in a fixed order, as `SELECT *` gives them. */
async function rowsOf(table: string): Promise<RowDataPacket[]> {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT * FROM ?? ORDER BY 1, 2", [table]);
  return rows;
}

/** Every table's rows, by table. */
async function everyTablesRows(): Promise<Record<string, RowDataPacket[]>> {
  const all: Record<string, RowDataPacket[]> = {};
  for (const name of EVERY_TABLE) all[name] = await rowsOf(name);
  return all;
}

/** A copy of geekykey_test as it is now, and the folder it's in. */
async function backUpNow(): Promise<{ file: string; dir: string }> {
  const dir = await copyDir();
  const { path } = await backUp(connection, {
    copyDir: dir,
    now: new Date(BACKED_UP_AT),
    print: () => {},
  });
  return { file: path, dir };
}

/** A restore into geekykey_test, answering with the right name unless a test says otherwise. */
async function restore(file: string, tables: string[], overrides: Partial<RestoreOptions> = {}) {
  const printed: string[] = [];
  const outcome = restoreTables(connection, {
    file,
    tables,
    copyDir: await copyDir(),
    now: new Date(RESTORED_AT),
    atTerminal: true,
    typeDatabaseName: async () => "geekykey_test",
    print: (line) => printed.push(line),
    ...overrides,
  });
  return { outcome, printed };
}

test("restoring taps puts the copy's taps back and leaves the claims made since", async () => {
  const { stationId, userId } = await fillEveryTable();
  const { file } = await backUpNow();
  const tapsInCopy = await rowsOf("taps");

  await testDb().delete(taps);
  await testDb().insert(taps).values({
    stationId,
    clientTapId: "tap-after-the-copy",
    userId,
    status: "accepted",
    receivedAt: "2026-11-17T12:00:00.000Z",
  });
  await testDb().insert(tokens).values({ uid: "04FFFFFFFFFFFF", userId: "user-claimed-later" });
  const tokensNow = await rowsOf("tokens");

  const { outcome } = await restore(file, ["taps"]);
  assert.equal(await outcome, "restored");

  assert.deepEqual(await rowsOf("taps"), tapsInCopy);
  assert.deepEqual(await rowsOf("tokens"), tokensNow);
});

test("every table comes back as it was, JSON columns included", async () => {
  await fillEveryTable();
  const { file } = await backUpNow();
  const before = await everyTablesRows();
  for (const [name, rows] of Object.entries(before)) {
    assert.ok(rows.length > 0, `${name} has no row to restore`);
  }

  for (const name of EVERY_TABLE) {
    await connection.query("DELETE FROM ??", [name]);
  }
  const { outcome } = await restore(file, EVERY_TABLE);
  assert.equal(await outcome, "restored");

  assert.deepEqual(await everyTablesRows(), before);
  assert.deepEqual((await rowsOf("answers"))[0]!.choices, { q1: "a" });
  assert.deepEqual((await rowsOf("connections"))[0]!.shared, ["q1"]);
});

test("stations can be restored on their own while taps point at them", async () => {
  await fillEveryTable();
  const { file } = await backUpNow();
  const stationsInCopy = await rowsOf("stations");
  await connection.query("UPDATE stations SET disabled_at = ?", [RESTORED_AT]);
  const tapsNow = await rowsOf("taps");
  const passportStationsNow = await rowsOf("passport_stations");

  const { outcome } = await restore(file, ["stations"]);
  assert.equal(await outcome, "restored");

  assert.deepEqual(await rowsOf("stations"), stationsInCopy);
  assert.deepEqual(await rowsOf("taps"), tapsNow);
  assert.deepEqual(await rowsOf("passport_stations"), passportStationsNow);
});

test("a restore that would leave a tap at a station the copy lacks changes nothing", async () => {
  const { userId } = await fillEveryTable();
  const { file } = await backUpNow();
  await testDb()
    .insert(stations)
    .values({
      id: "station-added-later",
      label: "Reader 2",
      apiKeyHash: "b".repeat(64),
    });
  await testDb().insert(taps).values({
    stationId: "station-added-later",
    clientTapId: "tap-2",
    userId,
    status: "accepted",
    receivedAt: RESTORED_AT,
  });
  const before = await everyTablesRows();

  const { outcome } = await restore(file, ["stations"]);
  await assert.rejects(outcome, /nothing was restored.*taps.*stations/is);

  assert.deepEqual(await everyTablesRows(), before);
});

test("a wrong database name changes nothing", async () => {
  await fillEveryTable();
  const { file } = await backUpNow();
  await testDb().delete(taps);
  const before = await everyTablesRows();

  for (const typed of ["geekykey", "GEEKYKEY_TEST", "geekykey_test ", ""]) {
    const { outcome, printed } = await restore(file, ["taps"], {
      typeDatabaseName: async () => typed,
    });
    assert.equal(await outcome, "not_confirmed");
    assert.ok(printed.some((line) => line.includes("Nothing was restored")));
  }

  assert.deepEqual(await everyTablesRows(), before);
});

/** Writes `copy` to a file in a new folder, as a copy file would be. */
async function copyFile(copy: unknown): Promise<string> {
  const file = join(await copyDir(), "copy.json");
  await writeFile(file, JSON.stringify(copy));
  return file;
}

for (const [what, change, error] of [
  [
    "a copy from another database",
    (copy: Copy) => ({ ...copy, database: "geekykey_staging" }),
    /geekykey_staging.*nothing was restored/is,
  ],
  [
    "a table the copy doesn't hold",
    (copy: Copy) => {
      const { taps: _, ...tables } = copy.tables;
      return { ...copy, tables };
    },
    /doesn't hold taps.*nothing was restored/is,
  ],
  [
    "a column the table no longer has",
    (copy: Copy) => ({
      ...copy,
      tables: { ...copy.tables, taps: copy.tables.taps!.map((row) => ({ ...row, gone: 1 })) },
    }),
    /gone.*nothing was restored/is,
  ],
  ["a file that isn't a copy", () => ({ rows: [] }), /isn't a copy/],
] as const) {
  test(`${what} stops the restore before anything changes`, async () => {
    await fillEveryTable();
    const { file } = await backUpNow();
    const changed = await copyFile(change(JSON.parse(await readFile(file, "utf8")) as Copy));
    await testDb().delete(taps);
    const before = await everyTablesRows();
    const dir = await copyDir();

    const { outcome } = await restore(changed, ["taps"], {
      copyDir: dir,
      typeDatabaseName: async () => assert.fail("asked for the name"),
    });
    await assert.rejects(outcome, error);

    assert.deepEqual(await everyTablesRows(), before);
    assert.deepEqual(await readdir(dir), []);
  });
}

test("a table the database doesn't have stops the restore before anything changes", async () => {
  await fillEveryTable();
  const { file } = await backUpNow();
  const copy = JSON.parse(await readFile(file, "utf8")) as Copy;
  const changed = await copyFile({ ...copy, tables: { ...copy.tables, old_table: [] } });

  const { outcome } = await restore(changed, ["old_table"], {
    typeDatabaseName: async () => assert.fail("asked for the name"),
  });
  await assert.rejects(outcome, /no table called old_table.*nothing was restored/is);
});

test("production's restore refuses a name that doesn't come from a terminal", async () => {
  const root = await createConnection(LOCAL_ROOT);
  onTestFinished(async () => {
    await root.query("DROP DATABASE IF EXISTS geekykey");
    await root.end();
  });
  // Named as production's is. The refusal comes first, so it needs no tables.
  await root.query("CREATE DATABASE IF NOT EXISTS geekykey");
  await root.query("USE geekykey");
  const dir = await copyDir();

  await assert.rejects(
    restoreTables(root, {
      file: join(dir, "never-read.json"),
      tables: ["taps"],
      copyDir: dir,
      now: new Date(RESTORED_AT),
      atTerminal: false,
      typeDatabaseName: async () => assert.fail("asked for the name with no terminal"),
      print: () => {},
    }),
    /terminal/,
  );

  assert.deepEqual(await readdir(dir), []);
});

test("the restore takes a copy of the tables as they were, and restoring from it undoes it", async () => {
  const { stationId, userId } = await fillEveryTable();
  const { file } = await backUpNow();
  await testDb().insert(taps).values({
    stationId,
    clientTapId: "tap-after-the-copy",
    userId,
    status: "accepted",
    receivedAt: RESTORED_AT,
  });
  const tapsBefore = await rowsOf("taps");
  const dir = await copyDir();

  const { outcome } = await restore(file, ["taps"], { copyDir: dir });
  assert.equal(await outcome, "restored");
  assert.equal((await rowsOf("taps")).length, 1);

  const [ownCopy, ...others] = await readdir(dir);
  assert.deepEqual(others, []);
  assert.equal(ownCopy, "geekykey_test-2026-11-17T14-00-00.000Z.json");
  assert.equal((await stat(join(dir, ownCopy!))).mode & 0o777, 0o600);
  const { outcome: undone } = await restore(join(dir, ownCopy!), ["taps"]);
  assert.equal(await undone, "restored");
  assert.deepEqual(await rowsOf("taps"), tapsBefore);
});

test("a write while the name is being typed stops the restore, since its copy doesn't hold it", async () => {
  const { stationId, userId } = await fillEveryTable();
  const { file } = await backUpNow();
  await testDb().delete(taps);

  const { outcome, printed } = await restore(file, ["taps"], {
    typeDatabaseName: async () => {
      await testDb().insert(taps).values({
        stationId,
        clientTapId: "tap-while-typing",
        userId,
        status: "accepted",
        receivedAt: RESTORED_AT,
      });
      return "geekykey_test";
    },
  });
  assert.equal(await outcome, "changed_since_copy");
  assert.ok(printed.some((line) => line.includes("Nothing was restored")));

  const rows = await rowsOf("taps");
  assert.deepEqual(
    rows.map((row) => row.client_tap_id),
    ["tap-while-typing"],
  );
});

test("the counts are shown before anyone is asked, and again after the restore", async () => {
  await fillEveryTable();
  const { file } = await backUpNow();
  await testDb().delete(taps);
  const askedAfter: string[] = [];

  const { outcome, printed } = await restore(file, ["taps"], {
    typeDatabaseName: async () => {
      askedAfter.push(printed.join("\n"));
      return "geekykey_test";
    },
  });
  assert.equal(await outcome, "restored");

  // Now, then in the copy.
  assert.match(askedAfter[0]!, /taps\s+0\s+1\n/);
  const afterwards = printed.join("\n").slice(askedAfter[0]!.length);
  assert.match(afterwards, /taps\s+1\n/);
  assert.match(afterwards, /Restored/);
});

test("the backup holds every table, the stand-in's included, readable only by its owner", async () => {
  await fillEveryTable();
  const dir = await copyDir();
  const printed: string[] = [];

  const { path } = await backUp(connection, {
    copyDir: dir,
    now: new Date(BACKED_UP_AT),
    print: (line) => printed.push(line),
  });

  assert.equal(path, join(dir, "geekykey_test-2026-11-17T10-00-00.000Z.json"));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const copy = JSON.parse(await readFile(path, "utf8")) as Copy;
  assert.equal(copy.database, "geekykey_test");
  assert.equal(copy.taken_at, BACKED_UP_AT);
  for (const name of EVERY_TABLE) {
    assert.deepEqual(copy.tables[name], JSON.parse(JSON.stringify(await rowsOf(name))), name);
  }
  assert.equal(copy.tables.tokens![0]!.uid, "04A1B2C3D4E5F6");
  assert.match(printed.join("\n"), /tokens\s+1\n/);
});
