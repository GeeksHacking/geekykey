import type { MiddlewareHandler } from "hono";
import type { Config } from "../config.ts";
import { bearerKey } from "../lib/bearer-key.ts";
import type { EventService } from "./event-service.ts";
import { hashStationKey } from "./station-keys.ts";
import type { StationsCopy } from "./stations-copy.ts";

export interface StationContext {
  id: string;
  /** The Event Service that registered the station, which its taps go to. */
  eventService: EventService;
}

/**
 * Reads the request's `config`, and sets `station`, and the request's
 * `deadline`, for the handlers after it.
 */
export type StationEnv = {
  Variables: { config: Config; station: StationContext; deadline: AbortSignal };
};

/**
 * Authenticates a reader station via `Authorization: Bearer <station key>`,
 * against `stationsCopy`, the registered stations (the API agreement's
 * section 3 and 11.1). The request's deadline (11.5) starts here, since
 * filling an empty copy counts against it (11.1). `401 invalid_station_key`
 * only when every Event Service's list is in hand and the key is on none of
 * them, and `503 event_service_unavailable` when a list is missing and the key
 * isn't on the others.
 */
export function stationAuth(
  stationsCopy: StationsCopy<EventService>,
): MiddlewareHandler<StationEnv> {
  return async (c, next) => {
    const key = bearerKey(c.req.header("Authorization"));
    if (key === null) return c.json({ error: "missing_station_key" }, 401);

    const deadline = AbortSignal.timeout(c.var.config.tapDeadlineMs);
    const check = await stationsCopy.find(await hashStationKey(key), {
      signal: deadline,
      // The one server keeps running after it answers, so a refresh needs nothing to finish.
      waitUntil: (work) => void work,
    });
    if (check.result === "unknown") return c.json({ error: "invalid_station_key" }, 401);
    if (check.result === "unavailable") {
      return c.json({ error: "event_service_unavailable" }, 503);
    }

    c.set("station", { id: check.stationId, eventService: check.eventService });
    c.set("deadline", deadline);
    return next();
  };
}
