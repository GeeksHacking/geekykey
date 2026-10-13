import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { type TapResultStatus, TapPipeline } from "../event/tap-pipeline.ts";
import { log } from "../lib/log.ts";
import { normaliseUid, UID_PATTERN } from "../lib/token-uid.ts";
import { jsonBody } from "../lib/validate.ts";
import { type Claims, ClaimsUnavailable } from "./claims.ts";
import { stationAuth, type StationEnv } from "./station-auth.ts";

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
 * Each token's owner comes from `claims`, within one deadline that starts once
 * the key is checked. A tap by a token nobody owns is answered `unknown_token`
 * here and stored nowhere; the rest go on to the tap pipeline, as their
 * owners' taps. When the owners can't be had in time, the whole request fails
 * with `503 claims_unavailable`, and the station keeps its taps to resend.
 *
 * It still reaches into the Event side: the key check reads `stations`, and
 * the tap pipeline is called directly. The rest of checkpoint 3 replaces each
 * with the request it will send once the two services run apart.
 */
export function tapsRoutes({ claims }: { claims: Claims }) {
  return new Hono<TapsEnv>().post("/", stationAuth, tapBody, async (c) => {
    const { db, config, station } = c.var;
    const { taps } = c.req.valid("json");
    const deadline = AbortSignal.timeout(config.tapDeadlineMs);

    let owners: Map<string, string>;
    try {
      owners = await claims.ownersOf([...new Set(taps.map((t) => t.uid))], deadline);
    } catch (err) {
      if (!(err instanceof ClaimsUnavailable)) throw err;
      log("claims_unavailable", { station_id: station.id, reason: err.reason, status: err.status });
      return c.json({ error: "claims_unavailable" }, 503);
    }

    const statuses = Array.from<TapResultStatus>({ length: taps.length });
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

    const pipeline = new TapPipeline(db, { cooldownSeconds: config.tapCooldownSeconds });
    const results = await pipeline.ingest(
      station.id,
      claimed.map(({ tap, userId }) => ({
        clientTapId: tap.client_tap_id,
        uid: tap.uid,
        userId,
        tappedAt: tap.tapped_at,
      })),
    );
    results.forEach((result, i) => (statuses[claimed[i]!.index] = result.status));

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
