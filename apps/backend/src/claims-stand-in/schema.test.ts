import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { onTestFinished, test } from "vitest";
import { LOCAL_ROOT } from "../../scripts/local-tidb.ts";
import { migrate } from "../db/migrate.ts";
import { testDb } from "../test-helpers.ts";
import { tokens } from "./schema.ts";

test("a token can belong to a user the Event side has never seen", async () => {
  // No foreign key crosses between the stand-in's table and the Event side's,
  // so an owner needs no row in `users`.
  const db = testDb();
  await db.insert(tokens).values({ uid: "04A1B2C3", userId: "never-logged-in" });

  const [token] = await db.select().from(tokens).where(eq(tokens.uid, "04A1B2C3")).limit(1);
  assert.equal(token?.userId, "never-logged-in");
});

const migrationsDir = join(import.meta.dirname, "../../drizzle");

/**
 * drizzle/ as it was up to and including the migration tagged `tag`, in a
 * folder of its own, so a database can be left where the version before
 * this one left it.
 */
async function migrationsUpTo(tag: string): Promise<string> {
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

/** An empty database of its own in the Docker TiDB, dropped after the test. */
async function scratchDatabase(): Promise<string> {
  const name = "geekykey_tokens_migration";
  const root = await createConnection(LOCAL_ROOT);
  await root.query(`DROP DATABASE IF EXISTS ${name}`);
  await root.query(`CREATE DATABASE ${name}`);
  onTestFinished(async () => {
    await root.query(`DROP DATABASE IF EXISTS ${name}`);
    await root.end();
  });
  return `mysql://root@${LOCAL_ROOT.host}:${LOCAL_ROOT.port}/${name}`;
}

test("the reshape keeps each current owner's claim, and deletes released tokens", async () => {
  // Production's tokens as the version before this one wrote them: a token
  // still claimed, and one released, whose row stayed with revoked_at set.
  const url = await scratchDatabase();
  await migrate(url, await migrationsUpTo("0001_tokens_without_a_foreign_key"));
  const connection = await createConnection({ uri: url });
  onTestFinished(() => connection.end());
  await connection.query(
    `INSERT INTO tokens (uid, user_id, paired_at, revoked_at) VALUES
      ('04A1B2C3D4E5F6', 'test-participant', '2026-10-12T05:00:00.000Z', NULL),
      ('04C9E1A27B3080', 'test-participant', '2026-10-11T05:00:00.000Z', '2026-10-11T06:00:00.000Z')`,
  );

  await migrate(url);

  const [rows] = await connection.query("SELECT uid, user_id, claimed_at FROM tokens");
  assert.deepEqual(rows, [
    {
      uid: "04A1B2C3D4E5F6",
      user_id: "test-participant",
      claimed_at: "2026-10-12T05:00:00.000Z",
    },
  ]);
});
