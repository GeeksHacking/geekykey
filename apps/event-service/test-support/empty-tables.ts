/**
 * Deletes every row in geekykey_test before each test. Deleting doesn't reset
 * AUTO_INCREMENT, so no test may assume an `id` value.
 */
import { beforeEach } from "vitest";
import { tokens } from "../src/claims-stand-in/schema.ts";
import { passportStations, stations, taps, usedLoginLinks, users } from "../src/event/schema.ts";
import { testDb } from "../src/test-helpers.ts";

beforeEach(async () => {
  // Rows that point at others go first, for the foreign keys.
  for (const table of [taps, passportStations, tokens, stations, users, usedLoginLinks]) {
    await testDb().delete(table);
  }
});
