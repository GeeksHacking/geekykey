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

/** The most tokens one load of token kinds may carry, which the service holds to as well. */
export const MAX_TOKENS_PER_LOAD = 500;

/** Simulated request latency for the mock client, in milliseconds. */
export const MOCK_LATENCY_MS: readonly [number, number] = [180, 520];

/**
 * Where the Event screens live, per API agreement 2 ("Base URLs"). The /sign-out page goes back
 * there when it may have no /me to read an event's address from, as the Event screens' own
 * GEEKYKEY_SCREENS_URL points here.
 */
export const EVENT_SCREENS_URL = import.meta.env.PROD
  ? "https://event.geekshacking.com/"
  : "http://localhost:5173/";

/** Where the login lands a participant with no tokens yet. */
export const HOME_PATH = "/" as const;
