/**
 * Agreement 10.1: poll the station list every 10 to 15 seconds. No websockets.
 */
export const POLL_STATIONS_MS = 12_000;

/** A station counts as online when it was seen within this window (agreement 10). The mock mirrors it. */
export const STATION_ONLINE_WINDOW_MS = 120_000;

/**
 * The accounts `mise run seed` creates, listed by the dev sign-in form. `dev-organizer-1`
 * is also on the GeekyKey Service's admin list, so the admin screens can be developed
 * (agreement 7.1). The GeekyKey Service keeps no users, so any ID signs in; these two
 * exist so a form has something to offer.
 */
export const SEEDED_USERS = [
  { id: "dev-user-1", label: "Alex Tan", isGeekyKeyAdmin: false },
  { id: "dev-organizer-1", label: "Priya Raman", isGeekyKeyAdmin: true },
] as const;

/** Simulated request latency for the mock client, in milliseconds. */
export const MOCK_LATENCY_MS: readonly [number, number] = [180, 520];

/** Where the Portal login lands a participant with no tokens yet. */
export const HOME_PATH = "/" as const;
