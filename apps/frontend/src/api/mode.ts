export type DataSourceScope = "admin" | "pair";

export const isLiveApiEnabled = ["1", "true"].includes(import.meta.env.VITE_LIVE_API ?? "");

export function dataSourceMessage(
  scope: DataSourceScope,
  live: boolean = isLiveApiEnabled,
): string {
  if (!live) return "Demo data — this screen uses fixture data.";
  if (scope === "pair") {
    return "Demo data — token pairing is still mocked until the pairing API slice is live.";
  }
  return "Demo data — organiser resource data is still mocked until those API slices are live.";
}
