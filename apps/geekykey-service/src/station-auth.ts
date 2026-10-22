import type { MiddlewareHandler } from "hono";
import type { EventService } from "./event-service.ts";
import { bearerKey } from "./lib/bearer-key.ts";
import { rateLimited } from "./rate-limit.ts";
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
 * section 3 and 11.1).
 *
 * First it counts the request against `stationLimit`, by the SHA-256 of the
 * key it sent, and turns it away with `429 rate_limited` once it's over
 * (section 2, "Rate limits"). Counting comes before the key check, so a
 * flood of wrong keys is turned away before it can make the copy ask the
 * Event Services for their stations. A request with no key isn't counted,
 * since there's nothing to count it by.
 *
 * The request's deadline (11.5), `deadlineMs` long,
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
  stationLimit: RateLimit,
): MiddlewareHandler<StationEnv> {
  return async (c, next) => {
    const key = bearerKey(c.req.header("Authorization"));
    if (key === null) return c.json({ error: "missing_station_key" }, 401);

    const keyHash = await hashStationKey(key);
    const { success } = await stationLimit.limit({ key: keyHash });
    if (!success) {
      return rateLimited(c, { station_id: stationsCopy.peek(keyHash)?.stationId ?? null });
    }

    const deadline = AbortSignal.timeout(deadlineMs);
    const waitUntil: WaitUntil = (work) => c.executionCtx.waitUntil(work);
    const check = await stationsCopy.find(keyHash, {
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
