import type { ApiClient } from "@/api/client";
import { LIVE_METHODS } from "@/api/create-client";

export const isLiveApiEnabled = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

/**
 * The methods the organiser screens call besides the session's. While a live build
 * still sends any of them to the mock, the console answers from sample data and
 * says so.
 */
const MOCKED_METHODS: readonly (keyof ApiClient)[] = [
  "listStationBoard",
  "createStation",
  "replaceStationKey",
  "disableStation",
  "enableStation",
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

/** The notice's wording is section 13's. */
export function dataSourceMessage(live: boolean = isLiveApiEnabled): string {
  if (!live) return "Demo data. This screen shows sample data.";
  return "Demo data. These screens show sample stations and taps, so nothing here changes the event.";
}
