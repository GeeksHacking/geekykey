/**
 * For tests that run a migration against a database holding the rows the
 * version before it wrote, and that read back a table's columns.
 */
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { onTestFinished } from "vitest";
import { LOCAL_ROOT } from "../scripts/local-tidb.ts";
import type { Db } from "../src/db/pool.ts";

const migrationsDir = join(import.meta.dirname, "../drizzle");

/**
 * drizzle/ as it was up to and including the migration tagged `tag`, in a
 * folder of its own, so a database can be left where the version before
 * this one left it.
 */
export async function migrationsUpTo(tag: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "geekykey-migrations-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await cp(migrationsDir, dir, { recursive: true });
  const journalPath = join(dir, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  assert.notEqual(last, -1, `no migration tagged ${tag}`);
  journal.entries = journal.entries.slice(0, last + 1);
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

/** An empty database called `name` in the Docker TiDB, dropped after the test. */
export async function scratchDatabase(name: string): Promise<string> {
  const root = await createConnection(LOCAL_ROOT);
  await root.query(`DROP DATABASE IF EXISTS ${name}`);
  await root.query(`CREATE DATABASE ${name}`);
  onTestFinished(async () => {
    await root.query(`DROP DATABASE IF EXISTS ${name}`);
    await root.end();
  });
  return `mysql://root@${LOCAL_ROOT.host}:${LOCAL_ROOT.port}/${name}`;
}

/** A table's columns in the database, in the order the table holds them. */
export async function columnsOf(db: Db, table: string): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ${table}
        ORDER BY ordinal_position`,
  );
  return (rows as unknown as { name: string }[]).map((row) => row.name);
}
