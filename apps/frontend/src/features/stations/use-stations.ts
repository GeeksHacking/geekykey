import { useApi } from "@/api/context";
import { POLL_STATIONS_MS } from "@/lib/constants";
import { useRequest } from "@/lib/use-request";

/** Station board data, polled so the online indicator moves without a refresh. */
export function useStations() {
  const api = useApi();
  return useRequest(() => api.listStations(), { key: "stations", pollMs: POLL_STATIONS_MS });
}
