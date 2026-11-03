import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Connection, createConnection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { LOCAL_ROOT } from "../../scripts/local-tidb.ts";
import { migrate, refuseChangedMigrations } from "./migrate.ts";

// A database of its own, so the check is tried on migrations made up here.
const DATABASE = "geekykey_changed_migrations";
const DATABASE_URL = `mysql://root@${LOCAL_ROOT.host}:${LOCAL_ROOT.port}/${DATABASE}`;

let root: Connection;
let folder: string;

beforeAll(async () => {
  root = await createConnection(LOCAL_ROOT);
});

afterAll(async () => {
  await root.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await root.end();
});

beforeEach(async () => {
  await root.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await root.query(`CREATE DATABASE ${DATABASE}`);
  folder = await mkdtemp(join(tmpdir(), "geekykey-migrations-"));
  await mkdir(join(folder, "meta"));
  return () => rm(folder, { recursive: true, force: true });
});

/** Writes `migrations` as drizzle-kit would, one SQL file each, in order. */
async function writeMigrations(migrations: { tag: string; when: number; sql: string }[]) {
  const entries = migrations.map(({ tag, when }, idx) => ({
    idx,
    version: "5",
    when,
    tag,
    breakpoints: true,
  }));
  await writeFile(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ version: "7", dialect: "mysql", entries }),
  );
  for (const { tag, sql } of migrations) await writeFile(join(folder, `${tag}.sql`), sql);
}

const FIRST = { tag: "0000_first", when: 1_000, sql: "CREATE TABLE `a` (`id` int);" };
const SECOND = { tag: "0001_second", when: 2_000, sql: "CREATE TABLE `b` (`id` int);" };

test("a database nothing has migrated yet passes", async () => {
  await writeMigrations([FIRST]);
  await refuseChangedMigrations(DATABASE_URL, folder);
});

test("migrations unchanged since they ran pass, with a new one still to run", async () => {
  await writeMigrations([FIRST]);
  await migrate(DATABASE_URL, folder);
  await writeMigrations([FIRST, SECOND]);
  await refuseChangedMigrations(DATABASE_URL, folder);
});

test("a migration edited after it ran fails, by name, and says to reset", async () => {
  await writeMigrations([FIRST, SECOND]);
  await migrate(DATABASE_URL, folder);
  await writeMigrations([FIRST, { ...SECOND, sql: "CREATE TABLE `b` (`id` bigint);" }]);
  await assert.rejects(
    refuseChangedMigrations(DATABASE_URL, folder),
    /changed after they ran here: 0001_second\. Run `pnpm db:reset`/,
  );
});

test("a migration rewritten under a new name fails, since the one that ran is gone", async () => {
  await writeMigrations([FIRST, SECOND]);
  await migrate(DATABASE_URL, folder);
  await writeMigrations([FIRST, { tag: "0001_rewritten", when: 3_000, sql: SECOND.sql }]);
  await assert.rejects(
    refuseChangedMigrations(DATABASE_URL, folder),
    /the one written at 1970-01-01T00:00:02\.000Z, now gone/,
  );
});
