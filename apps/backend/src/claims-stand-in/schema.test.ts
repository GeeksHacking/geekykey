import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { onTestFinished, test } from "vitest";
import { columnsOf, migrationsUpTo, scratchDatabase } from "../../test-support/migrations.ts";
import { migrate } from "../db/migrate.ts";
import { testDb } from "../test-helpers.ts";
import { tokens } from "./schema.ts";

test("tokens has only the columns the spec gives it after checkpoint 3", async () => {
  assert.deepEqual((await columnsOf(testDb(), "tokens")).toSorted(), [
    "claimed_at",
    "uid",
    "user_id",
  ]);
});

test("a token can belong to a user the Event side has never seen", async () => {
  // No foreign key crosses between the stand-in's table and the Event side's,
  // so an owner needs no row in `users`.
  const db = testDb();
  await db.insert(tokens).values({ uid: "04A1B2C3", userId: "never-logged-in" });

  const [token] = await db.select().from(tokens).where(eq(tokens.uid, "04A1B2C3")).limit(1);
  assert.equal(token?.userId, "never-logged-in");
});

test("the reshape keeps each current owner's claim, and deletes released tokens", async () => {
  // Production's tokens as the version before this one wrote them: a token
  // still claimed, and one released, whose row stayed with revoked_at set.
  const url = await scratchDatabase("geekykey_tokens_migration");
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

test("dropping the old columns keeps every claim", async () => {
  // Production's tokens as the version before this one wrote them, which set
  // claimed_at and left paired_at and revoked_at empty.
  const url = await scratchDatabase("geekykey_tokens_drop_migration");
  await migrate(url, await migrationsUpTo("0007_taps_are_never_unknown_token"));
  const connection = await createConnection({ uri: url });
  onTestFinished(() => connection.end());
  await connection.query(
    `INSERT INTO tokens (uid, user_id, claimed_at) VALUES
      ('04A1B2C3D4E5F6', 'test-participant', '2026-10-14T05:00:00.000Z')`,
  );

  await migrate(url);

  const [rows] = await connection.query("SELECT * FROM tokens");
  assert.deepEqual(rows, [
    {
      uid: "04A1B2C3D4E5F6",
      user_id: "test-participant",
      claimed_at: "2026-10-14T05:00:00.000Z",
    },
  ]);
});
