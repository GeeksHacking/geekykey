import { eq } from "drizzle-orm";
import type { Game } from "../../event/games.ts";
import { PASSPORT_GAME_ID, passportStations } from "../../event/schema.ts";

/**
 * The passport: a participant collects a stamp at each station that runs it
 * and has passport settings, worth that station's points. It counts a tap at
 * one of its stations unless the cooldown holds it back. Its record of what
 * it counted is the accepted taps at its stations, so it writes nothing of
 * its own. That holds while no other game counts taps at a passport station:
 * a tap another game counted there would be `accepted` too, and earn a stamp.
 * So a station's game is fixed once it has a tap a game counted or held back.
 *
 * Organizers choose the stations it runs on, and its settings are their data
 * too, in `passport_stations`. A station that runs it with no settings yet
 * isn't one of its stamp slots, so it checks them itself.
 */
export const passport: Game = {
  id: PASSPORT_GAME_ID,
  async judge(taps, { stationId, tx, cooldown }) {
    const [settings] = await tx
      .select({ stationId: passportStations.stationId })
      .from(passportStations)
      .where(eq(passportStations.stationId, stationId))
      .limit(1)
      // To see the latest settings, as the pipeline's reads do.
      .for("update");
    if (settings === undefined) return taps.map(() => "no_game");
    const heldBack = await cooldown(taps);
    return heldBack.map((held) => (held ? "cooldown" : "accepted"));
  },
};
