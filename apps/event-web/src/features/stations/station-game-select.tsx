import { useSetStationGame } from "@/features/stations/use-set-station-game";

import { describeError } from "@/api/errors";
import type { EventGame, EventStationBoardStation } from "@/api/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
  A station's game can change at any time, however many taps it has (BAC-183, agreement 9.11).
  Each tap records the game that judged it, so the picker waits only while its own write is in
  the air.
*/
export function StationGameSelect({
  station,
  games,
}: {
  station: EventStationBoardStation;
  games: EventGame[];
}) {
  const write = useSetStationGame(station.id);
  return (
    <div className="mt-2 max-w-48 space-y-1">
      <p className="text-xs font-medium">Game</p>
      <Select
        value={station.game ?? "none"}
        disabled={write.isPending}
        onValueChange={(game) => write.mutate(game)}
      >
        <SelectTrigger aria-label={`Game for ${station.label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No game</SelectItem>
          {games.map((game) => (
            <SelectItem key={game.id} value={game.id}>
              {game.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {write.isSuccess ? (
        <p role="status" className="text-xs">
          Game saved.
        </p>
      ) : null}
      {write.isError ? (
        <p role="alert" className="text-xs text-destructive-text">
          {describeError(write.error)}
        </p>
      ) : null}
    </div>
  );
}
