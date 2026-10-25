import { and, eq, isNotNull, isNull } from "drizzle-orm";
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
import { passportStations, stations } from "./schema.ts";
import { type BoardStation, loadBoardStation, loadStationBoard } from "./station-board.ts";
import { generateStationKey, hashStationKey } from "./station-keys.ts";

export interface AdminRouteDeps {
  session: SessionOptions;
  /** The clock the station board tells online stations by. */
  now?: () => Date;
}

/**
 * The longest station label, passport name or location, in Unicode code
 * points (the API agreement's 9.1 and 9.7).
 */
const TEXT_MAX = 80;

/**
 * Text an organizer types: trimmed, then at most 80 code points, and at least
 * one unless `blankAllowed`.
 */
const organizerText = (field: string, { blankAllowed = false } = {}) =>
  z
    .string()
    .trim()
    // Spread, not .length, which counts UTF-16 units and so would count an emoji twice.
    .refine(
      (text) => (blankAllowed || text !== "") && [...text].length <= TEXT_MAX,
      `${field} must be ${blankAllowed ? 0 : 1} to ${TEXT_MAX} characters`,
    );

/** A new station's label, the device's name. */
const createStationSchema = z.object({ label: organizerText("label") });

/**
 * A station's passport settings. A blank or missing location is none, and
 * missing points are 1, so a PUT always sets all three. Points fit the
 * `int` column.
 */
const passportSchema = z.object({
  name: organizerText("name"),
  location: organizerText("location", { blankAllowed: true })
    .nullish()
    .transform((location) => location || null),
  points: z.int32().min(0).default(1),
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

  // Disabling or enabling a station (9.9). Only a station in the other state
  // changes, so doing either twice keeps the first disabled_at and writes no
  // second log line. The GeekyKey Service refuses a disabled station's key, or
  // accepts an enabled one's again, at its next refresh of the registered stations.
  app.post("/stations/:id/:change{disable|enable}", async (c) => {
    const { id, change } = c.req.param();
    const disabling = change === "disable";
    const [result] = await c.var.db
      .update(stations)
      .set({ disabledAt: disabling ? now().toISOString() : null })
      .where(
        and(
          eq(stations.id, id),
          disabling ? isNull(stations.disabledAt) : isNotNull(stations.disabledAt),
        ),
      );
    if (result.affectedRows > 0) {
      log(disabling ? "station_disabled" : "station_enabled", {
        user_id: c.var.user.id,
        station_id: id,
      });
    }
    const station = await loadBoardStation(c.var.db, now(), id);
    if (!station) return c.json({ error: "not_found" }, 404);
    return c.json({ station: stationBody(station) });
  });

  // Adding a station to the passport, or changing its settings (9.1). A
  // station added takes the last stamp slot, since slots follow added_at, and
  // a change keeps added_at, so it never moves.
  app.put("/stations/:id/passport", jsonBody(passportSchema), async (c) => {
    const id = c.req.param("id");
    const { name, location, points } = c.req.valid("json");
    const saved = await c.var.db.transaction(async (tx) => {
      // The station's row, locked, so two organizers saving at once take turns
      // and the second changes what the first added.
      const [station] = await tx
        .select({ id: stations.id })
        .from(stations)
        .where(eq(stations.id, id))
        .for("update");
      if (!station) return null;
      const [current] = await tx
        .select({ addedAt: passportStations.addedAt })
        .from(passportStations)
        .where(eq(passportStations.stationId, id))
        // To see the latest settings once the lock is held, as the tap pipeline's reads do.
        .for("update");
      if (current) {
        await tx
          .update(passportStations)
          .set({ name, location, points })
          .where(eq(passportStations.stationId, id));
        return { added: false, addedAt: current.addedAt };
      }
      const addedAt = now().toISOString();
      await tx.insert(passportStations).values({ stationId: id, name, location, points, addedAt });
      return { added: true, addedAt };
    });
    if (!saved) return c.json({ error: "not_found" }, 404);
    return c.json(
      { passport: { station_id: id, name, location, points, added_at: saved.addedAt } },
      saved.added ? 201 : 200,
    );
  });

  return app;
}
