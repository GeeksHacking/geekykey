import type { GameOnStations } from "../event/games.ts";
import { passport } from "../games/passport/passport.ts";

/** The games the showcase runs, and on which stations. */
export const showcaseGames: readonly GameOnStations[] = [
  // Organizers choose the passport's stations on the day, in its settings.
  { game: passport, stations: "all" },
];
