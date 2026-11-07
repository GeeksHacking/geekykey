import type { MySqlTable } from "drizzle-orm/mysql-core";
import { tokenKinds, tokens } from "../src/claims-stand-in/schema.ts";
import {
  eventSettings,
  groupAllocation,
  groupMembers,
  participantGroups,
  passportStations,
  stations,
  taps,
  usedLoginLinks,
  userKinds,
  users,
} from "../src/event/schema.ts";
import { answers, connections, meetingHalves } from "../src/games/connections/schema.ts";

/*
  Which tables the event clear empties, and which it keeps (spec, checkpoint
  8: `db:clear-test-data`, in event-clear.ts). clear-lists.test.ts fails while
  a table in the database is on neither list, so a new table, such as a game's,
  gets a place here when it's made. event-clear.test.ts needs a row in it too.
*/

/** The event's own data: the taps, every claim, every game's records, and the people. */
export const clearedTables: readonly MySqlTable[] = [
  taps,
  // The claims stand-in's claims, so a returned token is claimed afresh.
  tokens,
  // Each user's first kind came from a token the clear releases.
  userKinds,
  // The answers game's, and the connections game's halves and connections.
  answers,
  meetingHalves,
  connections,
  // Who has joined and where they went, and whether allocation has started.
  groupMembers,
  groupAllocation,
  // So a name from a trial is free at the next event (BAC-124, BAC-145). Everyone logs in afresh.
  users,
];

/** The settings, which both events share. */
export const keptTables: readonly MySqlTable[] = [
  // Before `stations`, which it points at, so test-support/empty-tables.ts can delete in this order.
  passportStations,
  stations,
  // A kind belongs to the token, which keeps it at the next event.
  tokenKinds,
  // Each row goes a minute after its link expires anyway, and emptying it could let a used link in again.
  usedLoginLinks,
  // The event's groups, with its other settings. Their members are cleared.
  participantGroups,
  // The connection rule and the challenge, which organizers set with the groups (BAC-140, BAC-161).
  eventSettings,
];
