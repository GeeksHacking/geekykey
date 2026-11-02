import assert from "node:assert/strict";
import { getTableName, sql } from "drizzle-orm";
import { test } from "vitest";
import { testDb } from "../src/test-helpers.ts";
import { clearedTables, keptTables } from "./clear-lists.ts";

test("the clear empties or keeps every table the migrations make, and none twice", async () => {
  const [rows] = (await testDb().execute(sql`SHOW TABLES`)) as unknown as [
    Record<string, string>[],
  ];
  const inDatabase = rows
    .map((row) => Object.values(row)[0]!)
    // Drizzle's own record of the migrations it ran.
    .filter((name) => name !== "__drizzle_migrations")
    .sort();
  const listed = [...clearedTables, ...keptTables].map((table) => getTableName(table));
  assert.deepEqual([...listed].sort(), inDatabase);
  assert.equal(new Set(listed).size, listed.length);
});
