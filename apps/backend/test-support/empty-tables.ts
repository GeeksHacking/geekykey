/**
 * Deletes every row before each test, inside workerd, through the Hyperdrive
 * binding. Deleting doesn't reset AUTO_INCREMENT, so no test may assume an
 * `id` value.
 */
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";
import { createRequestDb } from "../src/db/hyperdrive.ts";
import { stations, taps, tokens, users } from "../src/db/schema.ts";

beforeEach(async () => {
  const { db, close } = createRequestDb(env.HYPERDRIVE);
  try {
    // Rows that point at others go first, for the foreign keys.
    for (const table of [taps, tokens, stations, users]) {
      await db.delete(table);
    }
  } finally {
    await close();
  }
});
