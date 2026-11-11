import { useSetStationGame } from "@/features/stations/use-set-station-game";

import { describeError } from "@/api/errors";
import type { EventStationBoardStation } from "@/api/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StationGameSelect({
  station,
  games,
}: {
  station: EventStationBoardStation;
  games: { id: string; name: string }[];
}) {
  const write = useSetStationGame(station.id);
  return (
    <div className="mt-2 max-w-48 space-y-1">
      <p className="text-xs font-medium">Game</p>
      <Select
        value={station.game ?? "none"}
        disabled={station.game_fixed || write.isPending}
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
      {station.game_fixed ? (
        <p className="text-xs text-muted-foreground">Game fixed after taps</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          The game cannot change once taps count here.
        </p>
      )}
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
