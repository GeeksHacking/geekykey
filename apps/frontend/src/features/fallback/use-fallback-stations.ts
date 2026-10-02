import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { EventStationBoardResponse, Station } from "@/api/types";

/** Passport-enabled stations for QR fallback, selected from the shared raw board query. */
export function useFallbackStations() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.stationBoard,
    queryFn: () => api.listStationBoard(),
    select: (board: EventStationBoardResponse) => {
      const stations: Station[] = board.stations.flatMap((station) =>
        station.passport
          ? [
              {
                id: station.id,
                name: station.passport.name,
                location: station.passport.location,
                points: station.passport.points,
                created_at: station.passport.added_at,
                last_seen_at: station.last_seen_at,
                online: station.online ?? false,
              },
            ]
          : [],
      );
      return { stations };
    },
    staleTime: 60_000,
  });
}
