/**
 * Checking a Firebase ID token, for `POST /auth/firebase` (the API
 * agreement's 7.2): the Event Service's and the GeekyKey Service's login at
 * the showcase (ADR 0004). Both use this one check, so a user gets the same
 * ID from each. After the showcase both log in through the Portal instead.
 */
export * from "./firebase-id-token.ts";
