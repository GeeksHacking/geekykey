import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import type { ConnectionsGame } from "./connections.ts";
import type { RelayGame } from "./relay.ts";
import type { OpenSeatGame } from "./open-seat.ts";
import type { UserLimit } from "./user-limit.ts";
import { loadMap, type MapStation } from "./map.ts";
import {
  requireMapReader,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";

export interface MapRouteDeps {
  session: SessionOptions;
  relay: RelayGame | null;
  /** The relay poll's own count, apart from the user's 60 a minute (9.13). */
  relayLimit: UserLimit;
  /** The event's open seat, or null for an event without it, whose stations have no `open_seat_until`. */
  openSeat?: OpenSeatGame | null;
  now?: () => Date;
  /** The event's connections game, whose web the map draws, or null for none. */
  connections: ConnectionsGame | null;
}

/** A station as the map's data lists it (the API agreement's 9.10). */
function stationBody(station: MapStation) {
  return {
    station_id: station.stationId,
    game: station.game,
    name: station.name,
    booth: station.booth,
    disabled: station.disabled,
    taps: station.taps,
    unique_participants: station.uniqueParticipants,
    last_tap_at: station.lastTapAt,
  };
}

/**
 * Mounted at /api/v1/map: what the map at our booth draws, polled every 2
 * seconds (9.10). Organizers and the map screens may read it. Anyone else
 * signed in gets `forbidden`, and nobody signed in `unauthenticated`. It
 * isn't under /admin, since a map screen isn't an organizer.
 */
export function mapRoutes({
  session,
  connections,
  relay,
  relayLimit,
  openSeat = null,
  now = () => new Date(),
}: MapRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();
  // The relay's one-second poll has its own count, so it never uses up the user's 60 (9.13).
  app.get(
    "/relay",
    requireSession(session, { limit: relayLimit }),
    requireMapReader(session),
    async (c) => {
      return c.json({ relay: relay ? await relay.mapState(c.var.db, now()) : null });
    },
  );

  app.get("/", requireSession(session), requireMapReader(session), async (c) => {
    const [stations, web, seat] = await Promise.all([
      loadMap(c.var.db),
      connections ? connections.web(c.var.db) : null,
      openSeat ? openSeat.openNow(c.var.db, now()) : null,
    ]);
    // With no connections game, the answer leaves `connections` out, and the screen draws no web.
    return c.json({
      stations: stations.map((station) => ({
        ...stationBody(station),
        // 9.10, for the next version, after 0.14 (BAC-190): when the station's open seat closes, with
        // no user, name or group, and only when the event runs the open seat.
        ...(openSeat && {
          open_seat_until: seat?.stationId === station.stationId ? seat.closesAt : null,
        }),
      })),
      ...(web && { connections: web }),
    });
  });

  return app;
}
