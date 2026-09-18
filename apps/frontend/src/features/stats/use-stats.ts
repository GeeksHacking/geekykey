import { useApi } from "@/api/context";
import { useRequest } from "@/lib/use-request";

export function useStats() {
  const api = useApi();
  return useRequest(() => api.stats(), { key: "stats" });
}
