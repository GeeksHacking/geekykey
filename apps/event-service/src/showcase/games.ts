import { relayGame } from "../games/relay/relay.ts";
import type { StationMessages } from "../event/station-messages.ts";
import { teamDuelsGame } from "../games/team-duels/team-duels.ts";
import type { GameOnStations } from "../event/games.ts";
import { passport } from "../games/passport/passport.ts";

/**
 * The games the showcase runs: the ones organizers choose for each station on
 * the day, in this order in their list (the API agreement's 9.2), and any that
 * watch every station.
 */
export const showcaseTeamDuels = teamDuelsGame();

export const showcaseGames = ({
  stationMessages,
}: {
  stationMessages: StationMessages;
}): readonly GameOnStations[] => [
  { game: passport, stations: "chosen", name: "Passport" },
  { game: showcaseTeamDuels, stations: "chosen", name: "Team duels" },
  { game: relayGame({ stationMessages }), stations: "chosen", name: "Relay" },
];
