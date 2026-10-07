import type { ApiClient } from "@/api/client";
import { LIVE_METHODS } from "@/api/create-client";

export const isLiveApiEnabled = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

/**
 * Every method create-client.ts still leaves on the mock client. Keep this list
 * and liveMethods() in step: a method missing here loses the demo-data notice
 * while it is still serving fixtures.
 */
const MOCKED_METHODS: readonly (keyof ApiClient)[] = [
  "listStations",
  "listStationBoard",
  "createStation",
  "setStationPassport",
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
