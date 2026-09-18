import { useApi } from "@/api/context";
import { useRequest } from "@/lib/use-request";

/** Station names for the filter and the fallback form. Fetched once; stations rarely change mid-event. */
export function useStationOptions() {
  const api = useApi();
  const request = useRequest(() => api.listStations(), { key: "station-options" });
  return { stations: request.data?.stations ?? [], status: request.status };
}
