import type { ApiClient } from "@/api/client";
import { LIVE_METHODS } from "@/api/create-client";

export const isLiveApiEnabled = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

const MOCKED_METHODS: readonly (keyof ApiClient)[] = [
  "listStations",
  "createStation",
  "listTaps",
  "createFallbackTap",
  "stats",
  "exportCsv",
];

export function isMockData(
  live: boolean = isLiveApiEnabled,
  liveMethods: ReadonlySet<keyof ApiClient> = LIVE_METHODS,
): boolean {
  if (!live) return true;
  return MOCKED_METHODS.some((method) => !liveMethods.has(method));
}

export function dataSourceMessage(live: boolean = isLiveApiEnabled): string {
  if (!live) return "Demo data — this screen uses fixture data.";
  return "Demo data — organiser resource data is still mocked until those API slices are live.";
}
