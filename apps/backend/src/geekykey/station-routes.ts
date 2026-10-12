import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { LocalTokenResolver, normaliseUid } from "../claims-stand-in/token-lookup.ts";
import { TapPipeline } from "../event/tap-pipeline.ts";
import { jsonBody } from "../lib/validate.ts";
import { stationAuth, type StationEnv } from "./station-auth.ts";

/** 4 to 10 bytes of hex after normalisation, covering single, double, and triple size ISO 14443A UIDs. */
const UID_PATTERN = /^(?:[0-9A-F]{2}){4,10}$/;

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
 * It still reaches into the other two areas: the key check reads the Event
 * side's `stations`, the owners come from the claims stand-in's `tokens`, and
 * the tap pipeline is called directly. Checkpoint 3 replaces each reach with
 * the request it will send once the two services run apart.
 */
export function tapsRoutes() {
  return new Hono<TapsEnv>().post("/", stationAuth, tapBody, async (c) => {
    const { db, config, station } = c.var;
    const { taps } = c.req.valid("json");
    const pipeline = new TapPipeline(db, new LocalTokenResolver(db), {
      cooldownSeconds: config.tapCooldownSeconds,
    });
    const results = await pipeline.ingest(
      station.id,
      taps.map((t) => ({
        clientTapId: t.client_tap_id,
        uid: t.uid,
        tappedAt: t.tapped_at,
      })),
    );
    // Deliberately no user details: readers must not hold PII (see RAMS, data privacy row).
    return c.json({
      station_id: station.id,
      results: results.map((r) => ({
        client_tap_id: r.clientTapId,
        status: r.status,
      })),
    });
  });
}
