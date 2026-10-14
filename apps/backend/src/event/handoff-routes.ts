import { tapsRequest } from "@geekykey/handoff";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import { requireBearerKey } from "../lib/bearer-key.ts";
import { jsonBody } from "../lib/validate.ts";
import { stations } from "./schema.ts";
import { TapPipeline, UnknownStation } from "./tap-pipeline.ts";

/**
 * What the GeekyKey Service asks of this Event Service (mounted at
 * /geekykey/v1): the API agreement's section 11. Every request carries the
 * Event Service key, checked in constant time and never logged, and each
 * body is checked against packages/handoff.
 */
export function handoffRoutes({ key }: { key: string }) {
  return new Hono<AppEnv>()
    .use(requireBearerKey(key, "invalid_event_service_key"))
    .post("/taps", jsonBody(tapsRequest), async (c) => {
      // The hand-off: a station's taps, each by a token's owner, as users (11.2).
      const { station_id, taps } = c.req.valid("json");
      const { db, config } = c.var;

      const pipeline = new TapPipeline(db, { cooldownSeconds: config.tapCooldownSeconds });
      let results;
      try {
        results = await pipeline.ingest(
          station_id,
          taps.map((tap) => ({
            clientTapId: tap.client_tap_id,
            userId: tap.user_id,
            tappedAt: tap.tapped_at,
          })),
        );
      } catch (err) {
        if (!(err instanceof UnknownStation)) throw err;
        return c.json(
          {
            error: "validation_failed",
            issues: [
              {
                code: "custom",
                path: ["station_id"],
                message: "station_id must be one of this Event Service's stations",
              },
            ],
          },
          400,
        );
      }

      // Heard from just now, for the station board's online light.
      await db
        .update(stations)
        .set({ lastSeenAt: new Date().toISOString() })
        .where(eq(stations.id, station_id));

      return c.json({
        results: results.map((r) => ({ client_tap_id: r.clientTapId, status: r.status })),
      });
    });
}
