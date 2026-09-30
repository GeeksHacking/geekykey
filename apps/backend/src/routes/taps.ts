import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/hyperdrive.ts";
import { jsonBody } from "../lib/validate.ts";
import { stationAuth, type StationEnv } from "../middleware/station-auth.ts";
import { normaliseUid } from "../services/identity.ts";
import type { TapPipeline } from "../services/taps.ts";

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
            .pipe(
              z.string().regex(UID_PATTERN, "uid must be 4 to 10 hex bytes"),
            ),
          tapped_at: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .min(1)
      .max(maxTaps),
  });
}

export interface TapsRouteDeps {
  db: Db;
  pipeline: TapPipeline;
  maxTapsPerRequest: number;
}

/**
 * POST /  (mounted at /api/v1/taps)
 *
 * Station-authenticated batch ingest. Accepts one or many taps so live scans
 * and offline flushes share one code path. Returns a status per tap in request
 * order; firmware may drop a tap from its buffer once any status comes back.
 */
export function tapsRoutes({ db, pipeline, maxTapsPerRequest }: TapsRouteDeps) {
  const schema = tapBodySchema(maxTapsPerRequest);

  return new Hono<StationEnv>().post(
    "/",
    stationAuth(db),
    jsonBody(schema),
    async (c) => {
      const { taps } = c.req.valid("json");
      const results = await pipeline.ingest(
        c.var.station.id,
        taps.map((t) => ({
          clientTapId: t.client_tap_id,
          uid: t.uid,
          tappedAt: t.tapped_at,
        })),
      );
      // Deliberately no user details: readers must not hold PII (see RAMS, data privacy row).
      return c.json({
        station_id: c.var.station.id,
        results: results.map((r) => ({
          client_tap_id: r.clientTapId,
          status: r.status,
        })),
      });
    },
  );
}
