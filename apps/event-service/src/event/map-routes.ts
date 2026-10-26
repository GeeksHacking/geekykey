import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import { loadMap, type MapStation } from "./map.ts";
import {
  requireMapReader,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";

export interface MapRouteDeps {
  session: SessionOptions;
}

/** A passport station as the map's data lists it (the API agreement's 9.10). */
function stationBody(station: MapStation) {
  return {
    station_id: station.stationId,
    name: station.name,
    booth: station.booth,
    disabled: station.disabled,
    taps: station.taps,
    unique_participants: station.uniqueParticipants,
    last_tap_at: station.lastTapAt,
  };
}

/**
 * Mounted at /api/v1/map: what the map on the big screen at our booth draws,
 * polled every 2 seconds (9.10). Organizers and the map screens may read
 * it. Anyone else signed in gets `forbidden`, and nobody signed in
 * `unauthenticated`. It isn't under /admin, since a map screen isn't an
 * organizer.
 */
export function mapRoutes({ session }: MapRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();
  app.use(requireSession(session), requireMapReader(session));

  app.get("/", async (c) => c.json({ stations: (await loadMap(c.var.db)).map(stationBody) }));

  return app;
}
