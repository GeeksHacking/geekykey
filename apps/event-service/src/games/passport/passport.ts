import { eq } from "drizzle-orm";
import type { Game } from "../../event/games.ts";
import { passportStations } from "../../event/schema.ts";

/**
 * The passport: a participant collects a stamp at each station with passport
 * settings, worth that station's points. It counts a tap at one of its
 * stations unless the cooldown holds it back, and a tap anywhere else isn't
 * its own. Its record of what it counted is the accepted taps at its
 * stations, so it writes nothing of its own. That holds while no other game
 * runs at a passport station: a tap another game counted there would be
 * `accepted` too, and earn a stamp.
 *
 * Its settings are organizers' data, in `passport_stations`, so it runs on
 * every station and checks them itself.
 */
export const passport: Game = {
  name: "passport",
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
