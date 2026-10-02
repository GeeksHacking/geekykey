/** Polling intervals from API-AGREEMENT.md. No websockets in the MVP. */
export const POLL_STATIONS_MS = 12_000;
export const POLL_TAPS_MS = 5_000;
/** The participant's own stamps and points. Not in the agreement's table; chosen so a tap shows up within one poll. */
export const POLL_ME_MS = 10_000;

/** A station counts as online when it was seen within this window. Backend computes it; the mock mirrors it. */
export const STATION_ONLINE_WINDOW_MS = 120_000;

/** Seeded by `mise run seed`. Only used by the dev-login form. */
export const SEEDED_USERS = [
  { id: "dev-user-1", label: "Alex Tan", role: "participant" },
  { id: "dev-organizer-1", label: "Priya Raman", role: "organiser" },
] as const;

/** Where the GeekyKey screens live. Same base URLs as API-AGREEMENT.md section 2. */
export const GEEKYKEY_WEB_URL = import.meta.env.PROD
  ? "https://geekykey.geekshacking.com/"
  : "http://localhost:5174/";

/** Simulated request latency for the mock client, in milliseconds. */
export const MOCK_LATENCY_MS: readonly [number, number] = [180, 520];
