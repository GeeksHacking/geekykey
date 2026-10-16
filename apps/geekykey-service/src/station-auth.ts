import type { MiddlewareHandler } from "hono";
import type { EventService } from "./event-service.ts";
import { bearerKey } from "./lib/bearer-key.ts";
import { hashStationKey } from "./station-keys.ts";
import type { StationsCopy, WaitUntil } from "./stations-copy.ts";

export interface StationContext {
  id: string;
  /** The Event Service that registered the station, which its taps go to. */
  eventService: EventService;
}

/** Sets `station`, the request's `deadline` and its `waitUntil`, for the handlers after it. */
export type StationEnv = {
  Variables: {
    station: StationContext;
    deadline: AbortSignal;
    waitUntil: WaitUntil;
  };
};

/**
 * Authenticates a reader station via `Authorization: Bearer <station key>`,
 * against `stationsCopy`, the registered stations (the API agreement's
 * section 3 and 11.1). The request's deadline (11.5), `deadlineMs` long,
 * starts here, since filling an empty copy counts against it (11.1).
 * `401 invalid_station_key` only when every Event Service's list is in hand
 * and the key is on none of them, and `503 event_service_unavailable` when a
 * list is missing and the key isn't on the others.
 *
 * Work the request starts for after its answer, such as the heartbeat
 * hand-off or a refresh of the copy, goes to `ctx.waitUntil()`, so the
 * station's answer never waits for it, and the Worker keeps running it once
 * the answer has gone.
 */
export function stationAuth(
  stationsCopy: StationsCopy<EventService>,
  deadlineMs: number,
): MiddlewareHandler<StationEnv> {
  return async (c, next) => {
    const key = bearerKey(c.req.header("Authorization"));
    if (key === null) return c.json({ error: "missing_station_key" }, 401);

    const deadline = AbortSignal.timeout(deadlineMs);
    const waitUntil: WaitUntil = (work) => c.executionCtx.waitUntil(work);
    const check = await stationsCopy.find(await hashStationKey(key), {
      signal: deadline,
      waitUntil,
    });
    if (check.result === "unknown") return c.json({ error: "invalid_station_key" }, 401);
    if (check.result === "unavailable") {
      return c.json({ error: "event_service_unavailable" }, 503);
    }

    c.set("station", { id: check.stationId, eventService: check.eventService });
    c.set("deadline", deadline);
    c.set("waitUntil", waitUntil);
    return await next();
  };
}
