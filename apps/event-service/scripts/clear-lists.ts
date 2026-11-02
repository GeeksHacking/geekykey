import type { MySqlTable } from "drizzle-orm/mysql-core";
import { tokenKinds, tokens } from "../src/claims-stand-in/schema.ts";
import {
  passportStations,
  stations,
  taps,
  usedLoginLinks,
  userKinds,
  users,
} from "../src/event/schema.ts";
import { answers } from "../src/games/connections/schema.ts";

/*
  Which tables the evening-before clear empties, and which it keeps (spec,
  checkpoint 8: `db:clear-test-data`, before the grad tea and again before
  the showcase). The clear itself isn't written yet. When it is, it empties
  `clearedTables`. clear-lists.test.ts fails while a table in the database is
  on neither list, so a new table, such as a game's, gets a place here when
  it's made.
*/

/** The event's own data: the taps, every claim, and every game's records. */
export const clearedTables: readonly MySqlTable[] = [
  taps,
  // The claims stand-in's claims, so a returned token is claimed afresh.
  tokens,
  // Each user's first kind came from a token the clear releases.
  userKinds,
  // The answers game's.
  answers,
];

/** The settings and the people, which both events share. */
export const keptTables: readonly MySqlTable[] = [
  stations,
  passportStations,
  users,
  // A kind belongs to the token, which keeps it at the next event.
  tokenKinds,
  // Each row goes a minute after its link expires anyway, and emptying it could let a used link in again.
  usedLoginLinks,
];
