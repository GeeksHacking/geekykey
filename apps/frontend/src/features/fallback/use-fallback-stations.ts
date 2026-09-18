import { useApi } from "@/api/context";
import { useRequest } from "@/lib/use-request";

export function useFallbackStations() {
  const api = useApi();
  return useRequest(() => api.listStations(), { key: "fallback-stations" });
}
