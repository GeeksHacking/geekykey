import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { Db } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
import {
  requireRole,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";
import { stations } from "./schema.ts";
import { type BoardStation, loadBoardStation, loadStationBoard } from "./station-board.ts";
import { generateStationKey, hashStationKey } from "./station-keys.ts";

export interface AdminRouteDeps {
  session: SessionOptions;
  /** The clock the station board tells online stations by. */
  now?: () => Date;
}

/** The longest station label, in Unicode code points (the API agreement's 9.7). */
const LABEL_MAX = 80;

/** A new station's label, the device's name: trimmed, then 1 to 80 code points. */
const createStationSchema = z.object({
  label: z
    .string()
    .trim()
    // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
    .refine(
      (label) => label !== "" && [...label].length <= LABEL_MAX,
      `label must be 1 to ${LABEL_MAX} characters`,
    ),
});

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

  /** The answer that issues a station's key (9.7, 9.8): the station as the board lists it, and the key. */
  const withKey = async (db: Db, stationId: string, key: string) => {
    const station = await loadBoardStation(db, now(), stationId);
    return { station: stationBody(station!), api_key: key };
  };

  // The station board, polled every 10 to 15 seconds (9.2).
  app.get("/stations", async (c) => {
    const board = await loadStationBoard(c.var.db, now());
    return c.json({ stations: board.map(stationBody) });
  });

  // Creating a station (9.7). Its key is in this answer and nowhere else: only its hash is stored.
  app.post("/stations", jsonBody(createStationSchema), async (c) => {
    const { label } = c.req.valid("json");
    const id = crypto.randomUUID();
    const key = generateStationKey();
    await c.var.db.insert(stations).values({ id, label, apiKeyHash: await hashStationKey(key) });
    log("station_created", { user_id: c.var.user.id, station_id: id });
    return c.json(await withKey(c.var.db, id, key), 201);
  });

  // Replacing a station's key (9.8). Its ID, passport settings, stamps and
  // disabled_at stay; the GeekyKey Service drops the old key at its next refresh.
  app.post("/stations/:id/key", async (c) => {
    const id = c.req.param("id");
    const key = generateStationKey();
    const [result] = await c.var.db
      .update(stations)
      .set({ apiKeyHash: await hashStationKey(key) })
      .where(eq(stations.id, id));
    if (result.affectedRows === 0) return c.json({ error: "not_found" }, 404);
    log("station_key_replaced", { user_id: c.var.user.id, station_id: id });
    return c.json(await withKey(c.var.db, id, key));
  });

  return app;
}
