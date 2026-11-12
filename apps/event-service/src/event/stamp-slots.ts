import { and, eq } from "drizzle-orm";
import { PASSPORT_GAME_ID, stations, taps } from "./schema.ts";

/**
 * Whether a station, joined to its passport settings, is a stamp slot (the
 * API agreement's section 4): it has settings, and runs the passport. A
 * station that runs another game keeps its settings, since nothing removes
 * them, but isn't a slot: it isn't in the passport, its taps never earn a
 * stamp, and the reads give it no passport name.
 */
export const runsThePassport = eq(stations.game, PASSPORT_GAME_ID);

/**
 * Whether a tap is one the passport counted, which earns a stamp and station
 * points (the API agreement's section 4). A tap another game counted at a
 * passport station isn't one, so a station's game can change at any time, and
 * set back to the passport, the station shows the stamps it had (BAC-183).
 */
export const countedByThePassport = and(
  eq(taps.status, "accepted"),
  eq(taps.game, PASSPORT_GAME_ID),
)!;
