import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/hyperdrive.ts";
import { stations } from "../db/schema.ts";
import { hashStationKey } from "../lib/station-keys.ts";

export interface StationContext {
  id: string;
  name: string;
  points: number;
}

export type StationEnv = { Variables: { station: StationContext } };

/**
 * Authenticates a reader station via `Authorization: Bearer <station key>`.
 * Sets `c.var.station` and bumps the station's last_seen_at.
 */
export function stationAuth(db: Db): MiddlewareHandler<StationEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const [scheme, key, ...rest] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !key || rest.length > 0) {
      return c.json({ error: "missing_station_key" }, 401);
    }

    const station = await db
      .select({ id: stations.id, name: stations.name, points: stations.points })
      .from(stations)
      .where(eq(stations.apiKeyHash, await hashStationKey(key)))
      .get();
    if (!station) return c.json({ error: "invalid_station_key" }, 401);

    c.set("station", station);
    await db
      .update(stations)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(eq(stations.id, station.id));
    return next();
  };
}
