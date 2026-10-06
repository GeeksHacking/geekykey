import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { EventStationBoardResponse, Station } from "@/api/types";

/** Station names for the scan-log filter, selected from the shared raw board query. */
export function useStationOptions() {
  const api = useApi();
  const query = useQuery({
    queryKey: queryKeys.stationBoard,
    queryFn: () => api.listStationBoard(),
    select: (board: EventStationBoardResponse) => {
      const stations: Station[] = board.stations.map((station) => ({
        id: station.id,
        name: station.passport?.name ?? station.label ?? "Unnamed station",
        location: station.passport?.location ?? null,
        points: station.passport?.points ?? 0,
        created_at: station.passport?.added_at ?? "",
        last_seen_at: station.last_seen_at,
        online: station.online ?? false,
      }));
      return { stations };
    },
    staleTime: 60_000,
  });
  return {
    stations: query.data?.stations ?? [],
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
