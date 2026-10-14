import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { log } from "../lib/log.ts";
import { trustedTappedAt } from "../lib/tapped-at.ts";
import { normaliseUid, UID_PATTERN } from "../lib/token-uid.ts";
import { jsonBody } from "../lib/validate.ts";
import { type Claims, ClaimsUnavailable } from "./claims.ts";
import { type EventService, EventServiceUnavailable } from "./event-service.ts";
import { stationAuth, type StationEnv } from "./station-auth.ts";
import type { StationsCopy } from "./stations-copy.ts";

export function tapBodySchema(maxTaps: number) {
  return z.object({
    taps: z
      .array(
        z.object({
          client_tap_id: z.string().min(1).max(128),
          uid: z
            .string()
            .min(1)
            .max(64)
            .transform(normaliseUid)
            .pipe(z.string().regex(UID_PATTERN, "uid must be 4 to 10 hex bytes")),
          tapped_at: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .min(1)
      .max(maxTaps),
  });
}

type TapsEnv = AppEnv & StationEnv;
type TapBodySchema = ReturnType<typeof tapBodySchema>;

/**
 * Checks the body against this request's batch limit. The limit is a setting,
 * and settings are read per request, so the check is built per request too.
 */
const tapBody: ReturnType<typeof jsonBody<TapBodySchema>> = (c, next) => {
  // jsonBody's check doesn't know this route's variables, so they're named here.
  const { config } = c.var as TapsEnv["Variables"];
  return jsonBody(tapBodySchema(config.maxTapsPerRequest))(c, next);
};

/**
 * POST /  (mounted at /api/v1/taps)
 *
 * Station-authenticated batch ingest. Accepts one or many taps so live scans
 * and offline flushes share one code path. Returns a status per tap in request
 * order; firmware may drop a tap from its buffer once any status comes back.
 *
 * The key is checked against `stationsCopy`, the stations each Event Service has
 * registered, within one deadline that starts with the check (station-auth.ts).
 * Each token's owner comes from `claims`, in what's left of it. A tap by a
 * token nobody owns is answered `unknown_token` here and stored nowhere. The
 * rest are handed in one call, as their owners' taps, to the Event Service
 * that registered the station, in whatever is left of the deadline (the API
 * agreement's 11.2 and 11.5). When the owners can't be had in time, the whole
 * request fails with `503 claims_unavailable`, and when the hand-off isn't
 * answered properly in time, with `503 event_service_unavailable`. Either
 * way, the station keeps its taps to resend. Neither is retried.
 */
export function tapsRoutes({
  claims,
  stationsCopy,
}: {
  claims: Claims;
  stationsCopy: StationsCopy<EventService>;
}) {
  return new Hono<TapsEnv>().post("/", stationAuth(stationsCopy), tapBody, async (c) => {
    const { station, deadline } = c.var;
    const { eventService } = station;
    const { taps } = c.req.valid("json");

    let owners: Map<string, string>;
    try {
      owners = await claims.ownersOf([...new Set(taps.map((t) => t.uid))], deadline);
    } catch (err) {
      if (!(err instanceof ClaimsUnavailable)) throw err;
      log("claims_unavailable", { station_id: station.id, reason: err.reason, status: err.status });
      return c.json({ error: "claims_unavailable" }, 503);
    }

    // A status an Event Service gives is passed on unchanged, even one of its own.
    const statuses = Array.from<string>({ length: taps.length });
    const claimed = taps.flatMap((tap, index) => {
      const userId = owners.get(tap.uid);
      if (userId !== undefined) return [{ index, tap, userId }];
      statuses[index] = "unknown_token";
      log("unknown_token", {
        station_id: station.id,
        client_tap_id: tap.client_tap_id,
        uid: tap.uid,
      });
      return [];
    });

    if (claimed.length > 0) {
      const now = new Date();
      let results;
      try {
        results = await eventService.handOffTaps(
          {
            station_id: station.id,
            taps: claimed.map(({ tap, userId }) => ({
              client_tap_id: tap.client_tap_id,
              user_id: userId,
              tapped_at: trustedTappedAt(tap.tapped_at, now),
            })),
          },
          deadline,
        );
      } catch (err) {
        if (!(err instanceof EventServiceUnavailable)) throw err;
        log("handoff_failed", {
          station_id: station.id,
          event_service: eventService.id,
          reason: err.reason,
          status: err.status,
        });
        return c.json({ error: "event_service_unavailable" }, 503);
      }
      results.forEach((result, i) => (statuses[claimed[i]!.index] = result.status));
    }

    // Deliberately no user details: readers must not hold PII (see RAMS, data privacy row).
    return c.json({
      station_id: station.id,
      results: taps.map((tap, index) => ({
        client_tap_id: tap.client_tap_id,
        status: statuses[index],
      })),
    });
  });
}
