import type { GameOnStations } from "../event/games.ts";
import { passport } from "../games/passport/passport.ts";

/**
 * The games the showcase runs: the ones organizers choose for each station on
 * the day, in this order in their list (the API agreement's 9.2), and any that
 * watch every station.
 */
export const showcaseGames: readonly GameOnStations[] = [
  { game: passport, stations: "chosen", name: "Passport" },
];
