import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import {
  requireRole,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";
import { type BoardStation, loadStationBoard } from "./station-board.ts";

export interface AdminRouteDeps {
  session: SessionOptions;
  /** The clock the station board tells online stations by. */
  now?: () => Date;
}

/** A station as the station board lists it (the API agreement's 9.2). */
function stationBody(station: BoardStation) {
  return {
    id: station.id,
    label: station.label,
    created_at: station.createdAt,
    disabled_at: station.disabledAt,
    passport: station.passport && {
      name: station.passport.name,
      location: station.passport.location,
      points: station.passport.points,
      added_at: station.passport.addedAt,
    },
    last_seen_at: station.lastSeenAt,
    online: station.online,
    firmware_version: station.firmwareVersion,
    buffered_taps: station.bufferedTaps,
    reader_ok: station.readerOk,
    last_tap_at: station.lastTapAt,
  };
}

/**
 * Mounted at /api/v1/admin: the organizer endpoints (the API agreement's
 * section 9). Nobody signed in gets `unauthenticated`, and anyone not on the
 * organizer list gets `forbidden`.
 */
export function adminRoutes({ session, now = () => new Date() }: AdminRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();
  app.use(requireSession(session), requireRole("organizer"));

  // The station board, polled every 10 to 15 seconds (9.2).
  app.get("/stations", async (c) => {
    const board = await loadStationBoard(c.var.db, now());
    return c.json({ stations: board.map(stationBody) });
  });

  return app;
}
