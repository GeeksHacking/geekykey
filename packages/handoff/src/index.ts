/**
 * What the GeekyKey Service sends an Event Service, and what it answers, as
 * Zod schemas: the API agreement's section 11. The Event Service checks each
 * request with them, and the GeekyKey Service checks each answer. Other teams
 * get the JSON Schema written from them in json-schema/ (`pnpm json-schema`).
 *
 * A change here must work with the other service's previous version, since
 * the two deploy separately (the agreement's section 1).
 */
export * from "./taps.ts";
