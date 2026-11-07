/**
 * Deletes every row in geekykey_test before each test. Deleting doesn't reset
 * AUTO_INCREMENT, so no test may assume an `id` value.
 */
import { beforeEach } from "vitest";
import { clearedTables, keptTables } from "../scripts/clear-lists.ts";
import { testDb } from "../src/test-helpers.ts";

// clear-lists.test.ts fails if a table is on neither list, so this covers them all.
// Rows that point at others go first, for the foreign keys, as the lists' order has it.
beforeEach(async () => {
  for (const table of [...clearedTables, ...keptTables]) {
    await testDb().delete(table);
  }
});
