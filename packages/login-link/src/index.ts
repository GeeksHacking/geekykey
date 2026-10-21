/**
 * Login links (the API agreement's 7.4, 8.6 and 11.9): the GeekyKey Service
 * makes one for its session's user, and the Event Service logs that same
 * user in with it, so a guest, who has no other way in, and a Google user
 * alike reach the Event screens without logging in again (ADR 0005). Both
 * use this one format, so neither can drift from the other.
 */
export * from "./login-link.ts";
