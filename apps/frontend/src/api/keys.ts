import type { ListTapsQuery } from "@/api/types";

/** Filters that identify a scan-log query. Paging fields are not part of the identity. */
export type TapsFilters = Omit<ListTapsQuery, "limit" | "before_id">;

/*
  Every TanStack Query key in the app, in one place, so invalidation after a
  mutation is a lookup rather than a guess. Keys are hierarchical: invalidating
  ["taps"] hits every scan-log query regardless of filters.
*/
export const queryKeys = {
  me: ["me"] as const,
  stations: ["stations"] as const,
  taps: (filters: TapsFilters) => ["taps", filters] as const,
  tapsOlder: (filters: TapsFilters, cursor: number | undefined) =>
    ["taps", filters, "older", cursor] as const,
  stats: ["stats"] as const,
};
