import { eq } from "drizzle-orm";
import { PASSPORT_GAME_ID, stations } from "./schema.ts";

/**
 * Whether a station, joined to its passport settings, is a stamp slot (the
 * API agreement's section 4): it has settings, and runs the passport. A
 * station that runs another game keeps its settings, since nothing removes
 * them, but isn't a slot: it isn't in the passport, its taps never earn a
 * stamp, and the reads give it no passport name.
 */
export const runsThePassport = eq(stations.game, PASSPORT_GAME_ID);
