import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "vitest";
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
