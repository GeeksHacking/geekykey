import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { Db } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { jsonBody, queryParams } from "../lib/validate.ts";
import type { GameOnStations, Tx } from "./games.ts";
import {
  requireRole,
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "./session-auth.ts";
import {
  COUNTED_TAP_STATUSES,
  PASSPORT_GAME_ID,
  passportStations,
  STORED_TAP_STATUSES,
  stations,
  taps,
} from "./schema.ts";
import { exportTapsCsv } from "./export.ts";
import { runsThePassport } from "./stamp-slots.ts";
import { type BoardStation, loadBoardStation, loadStationBoard } from "./station-board.ts";
import { generateStationKey, hashStationKey } from "./station-keys.ts";
import { type EventStats, loadStats } from "./stats.ts";
import { type LoggedTap, loadTapLog } from "./tap-log.ts";
import { TapPipeline } from "./tap-pipeline.ts";

export interface AdminRouteDeps {
  session: SessionOptions;
  /** The games this event runs, which judge a QR fallback tap as they judge a station's. */
  games: readonly GameOnStations[];
  /** The clock the station board tells online stations by, and a QR fallback tap is received by. */
  now?: () => Date;
}

/**
 * The longest station label, passport name, location or booth, in Unicode
 * code points (the API agreement's 9.1 and 9.7).
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

/** Optional text an organizer types: a blank or missing one is none. */
const optionalOrganizerText = (field: string) =>
  organizerText(field, { blankAllowed: true })
    .nullish()
    .transform((text) => text || null);

/**
 * A station's booth (9.1, 9.12): a blank or null one is none. Nullable, not
 * nullish like optionalOrganizerText, so a booth 9.1 leaves out stays
 * undefined and keeps the station's.
 */
const boothText = organizerText("booth", { blankAllowed: true })
  .nullable()
  .transform((text) => text || null);

/**
 * A station's passport settings. A blank or missing location is none, and
 * missing points are 1, so a PUT always sets all three. Points fit the `int`
 * column. The booth is the station's, and a missing one leaves it as it is.
 */
const passportSchema = z.object({
  name: organizerText("name"),
  location: optionalOrganizerText("location"),
  booth: boothText.optional(),
  points: z.int32().min(0).default(1),
});

/** A station's booth (9.12), which is never left out. */
const boothSchema = z.object({ booth: boothText });

/**
 * Whether the station has a stored tap that a game counted or held back, from
 * it or the QR fallback, which fixes its game (9.11). A locking read, so it
 * sees the latest taps once the station's row is locked (tap-pipeline.ts says
 * why, at #lockStation).
 */
async function hasCountedTap(tx: Tx, stationId: string): Promise<boolean> {
  const [tap] = await tx
    .select({ id: taps.id })
    .from(taps)
    .where(and(eq(taps.stationId, stationId), inArray(taps.status, COUNTED_TAP_STATUSES)))
    .limit(1)
    .for("update");
  return tap !== undefined;
}

/** A station as the station board lists it (the API agreement's 9.2). */
function stationBody(station: BoardStation) {
  return {
    id: station.id,
    label: station.label,
    created_at: station.createdAt,
    disabled_at: station.disabledAt,
    game: station.game,
    game_fixed: station.gameFixed,
    booth: station.booth,
    passport: station.passport && {
      name: station.passport.name,
      location: station.passport.location,
      // The station's booth, kept in the passport because fields are never removed (9.2).
      booth: station.booth,
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

/** Which taps the scan log lists (9.3). Unknown query parameters are ignored. */
const tapLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // At least 1, as every tap ID is, so an empty `before_id=`, which coerces to 0, fails too.
  before_id: z.coerce.number().int().min(1).optional(),
  station_id: z.string().optional(),
  status: z.enum(STORED_TAP_STATUSES).optional(),
});

/**
 * A QR fallback tap (9.4): the station it's logged at, and whose it is. The
 * user ID is checked as a station tap's is (packages/handoff), once trimmed,
 * since an organizer may type it.
 */
const fallbackTapSchema = z.object({
  station_id: z.string(),
  user_id: z.string().trim().min(1).max(128),
});

/** A tap as the scan log lists it (the API agreement's 9.3). */
function tapBody(tap: LoggedTap) {
  return {
    id: tap.id,
    client_tap_id: tap.clientTapId,
    station: { id: tap.stationId, name: tap.stationName },
    user: { id: tap.userId, display_name: tap.displayName },
    status: tap.status,
    source: tap.source,
    tapped_at: tap.tappedAt,
    received_at: tap.receivedAt,
  };
}

/** The organizers' totals as the summary reads them (the API agreement's 9.5). */
function statsBody(stats: EventStats) {
  return {
    total_taps: stats.totalTaps,
    accepted_taps: stats.acceptedTaps,
    unique_participants: stats.uniqueParticipants,
    stations: stats.stations.map((station) => ({
      station_id: station.stationId,
      name: station.name,
      accepted_taps: station.acceptedTaps,
      unique_participants: station.uniqueParticipants,
    })),
  };
}

/**
 * Mounted at /api/v1/admin: the organizer endpoints (the API agreement's
 * section 9). Nobody signed in gets `unauthenticated`, and anyone not on the
 * organizer list gets `forbidden`.
 */
export function adminRoutes({ session, games, now = () => new Date() }: AdminRouteDeps) {
  const app = new Hono<AppEnv & SessionEnv>();
  app.use(requireSession(session), requireRole("organizer"));

  /** The games organizers choose a station's from, in the settings' order (9.2). */
  const gameChoices = games.flatMap((onStations) =>
    onStations.stations === "chosen" ? [{ id: onStations.game.id, name: onStations.name }] : [],
  );
  /** Whether organizers can choose the passport, so 9.1 may give it to a station with no game. */
  const offersThePassport = gameChoices.some((choice) => choice.id === PASSPORT_GAME_ID);
  /** A station's game (9.11): one of gameChoices by its ID, or null for none. Never left out. */
  const gameSchema = z.object({
    game: z
      .string()
      .nullable()
      .refine(
        (game) => game === null || gameChoices.some((choice) => choice.id === game),
        `game must be null or one of: ${gameChoices.map((choice) => choice.id).join(", ")}`,
      ),
  });

  /** The answer that issues a station's key (9.7, 9.8): the station as the board lists it, and the key. */
  const withKey = async (db: Db, stationId: string, key: string) => {
    const station = await loadBoardStation(db, now(), stationId);
    return { station: stationBody(station!), api_key: key };
  };

  // The station board, polled every 10 to 15 seconds (9.2), with the games organizers choose from.
  app.get("/stations", async (c) => {
    const board = await loadStationBoard(c.var.db, now());
    return c.json({ games: gameChoices, stations: board.map(stationBody) });
  });

  // The scan log, newest first (9.3).
  app.get("/taps", queryParams(tapLogQuerySchema), async (c) => {
    const { limit, before_id, station_id, status } = c.req.valid("query");
    const page = await loadTapLog(c.var.db, {
      limit,
      beforeId: before_id,
      stationId: station_id,
      status,
    });
    return c.json({ taps: page.taps.map(tapBody), next_before_id: page.nextBeforeId });
  });

  // The QR fallback (9.4): an organizer logs a tap at a station for a
  // participant. It goes through the station taps' pipeline, so the cooldown
  // and the games treat it the same, with a client_tap_id of its own. Only a
  // stamp slot takes one, so the passport counts it or holds it back. It is
  // stored as no_game only if an organizer changes the station's game between
  // this check and the pipeline's lock, which can happen only before the
  // station's first counted tap (9.11).
  app.post("/taps", jsonBody(fallbackTapSchema), async (c) => {
    const { station_id, user_id } = c.req.valid("json");
    const { db, config } = c.var;
    const [inPassport] = await db
      .select({ stationId: passportStations.stationId })
      .from(passportStations)
      .innerJoin(stations, and(eq(stations.id, passportStations.stationId), runsThePassport))
      .where(eq(passportStations.stationId, station_id));
    if (!inPassport) return c.json({ error: "not_found" }, 404);
    const clientTapId = crypto.randomUUID();
    const pipeline = new TapPipeline(db, {
      cooldownSeconds: config.tapCooldownSeconds,
      games,
      now,
    });
    const [result] = await pipeline.ingest(
      station_id,
      [{ clientTapId, userId: user_id, tappedAt: null }],
      "qr_fallback",
    );
    // The tap's ID, which the pipeline doesn't give back. The pipeline has committed, so the
    // row is there.
    const [stored] = await db
      .select({ id: taps.id })
      .from(taps)
      .where(and(eq(taps.stationId, station_id), eq(taps.clientTapId, clientTapId)));
    log("qr_fallback_logged", {
      user_id: c.var.user.id,
      station_id,
      client_tap_id: clientTapId,
    });
    return c.json({ result: { id: stored!.id, status: result!.status } }, 201);
  });

  // The organizers' totals (9.5).
  app.get("/stats", async (c) => c.json(statsBody(await loadStats(c.var.db))));

  // The stored taps as a file, for the A/B analysis (9.6).
  app.get("/export.csv", async (c) => {
    const csv = await exportTapsCsv(c.var.db);
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="geekykey-taps.csv"',
    });
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

  // Setting the game a station runs, or none (9.11). The station's row is
  // locked, as the tap pipeline locks it, so a tap can't be judged by one game
  // while the station changes to another. The same game again changes nothing
  // and writes no log line, even once the game is fixed.
  app.put("/stations/:id/game", jsonBody(gameSchema), async (c) => {
    const id = c.req.param("id");
    const { game } = c.req.valid("json");
    const outcome = await c.var.db.transaction(async (tx) => {
      const [station] = await tx
        .select({ game: stations.game })
        .from(stations)
        .where(eq(stations.id, id))
        .for("update");
      if (!station) return "not_found";
      if (station.game === game) return "unchanged";
      // Another game's counted taps would count for the new one.
      if (await hasCountedTap(tx, id)) return "fixed";
      await tx.update(stations).set({ game }).where(eq(stations.id, id));
      return "changed";
    });
    if (outcome === "not_found") return c.json({ error: "not_found" }, 404);
    if (outcome === "fixed") return c.json({ error: "station_has_taps" }, 409);
    // Once the transaction has committed, as 9.1's lines are.
    if (outcome === "changed") {
      log("station_game_changed", { user_id: c.var.user.id, station_id: id, game });
    }
    const station = await loadBoardStation(c.var.db, now(), id);
    return c.json({ station: stationBody(station!) });
  });

  // Setting the booth a station stands at, or none (9.12), at any time and
  // whatever game it runs. Only a different booth changes the row, so the
  // same booth again writes no log line.
  app.put("/stations/:id/booth", jsonBody(boothSchema), async (c) => {
    const id = c.req.param("id");
    const { booth } = c.req.valid("json");
    const [result] = await c.var.db
      .update(stations)
      .set({ booth })
      // <=> is equality that counts two nulls as equal.
      .where(and(eq(stations.id, id), sql`not (${stations.booth} <=> ${booth})`));
    if (result.affectedRows > 0) {
      log("station_booth_changed", { user_id: c.var.user.id, station_id: id });
    }
    const station = await loadBoardStation(c.var.db, now(), id);
    if (!station) return c.json({ error: "not_found" }, 404);
    return c.json({ station: stationBody(station) });
  });

  // Adding a station to the passport, or changing its settings (9.1). A
  // station added takes the last stamp slot, since slots follow added_at, and
  // a change keeps added_at, so it never moves. A save that changes nothing
  // writes no log line, as a repeated disable doesn't.
  app.put("/stations/:id/passport", jsonBody(passportSchema), async (c) => {
    const id = c.req.param("id");
    const { name, location, booth, points } = c.req.valid("json");
    const saved = await c.var.db.transaction(async (tx) => {
      // The station's row, locked, so two organizers saving at once take turns
      // and the second changes what the first added.
      const [station] = await tx
        .select({ game: stations.game, booth: stations.booth })
        .from(stations)
        .where(eq(stations.id, id))
        .for("update");
      if (!station) return null;
      // The booth is the station's (9.12), so a save that leaves it out keeps it.
      const boothChanged = booth !== undefined && booth !== station.booth;
      if (boothChanged) {
        await tx.update(stations).set({ booth }).where(eq(stations.id, id));
      }
      const savedBooth = booth === undefined ? station.booth : booth;
      // A station with no game runs the passport from now on, so its next taps
      // count, unless its game is fixed or this event doesn't run the passport.
      // Any other game stays.
      const givenThePassport =
        offersThePassport && station.game === null && !(await hasCountedTap(tx, id));
      if (givenThePassport) {
        await tx.update(stations).set({ game: PASSPORT_GAME_ID }).where(eq(stations.id, id));
      }
      const [current] = await tx
        .select({
          name: passportStations.name,
          location: passportStations.location,
          points: passportStations.points,
          addedAt: passportStations.addedAt,
        })
        .from(passportStations)
        .where(eq(passportStations.stationId, id))
        // To see the latest settings once the lock is held, as the tap pipeline's reads do.
        .for("update");
      if (current) {
        const same =
          current.name === name && current.location === location && current.points === points;
        if (!same) {
          await tx
            .update(passportStations)
            .set({ name, location, points })
            .where(eq(passportStations.stationId, id));
        }
        return {
          added: false,
          changed: !same,
          givenThePassport,
          boothChanged,
          booth: savedBooth,
          addedAt: current.addedAt,
        };
      }
      const addedAt = now().toISOString();
      await tx.insert(passportStations).values({ stationId: id, name, location, points, addedAt });
      return {
        added: true,
        changed: true,
        givenThePassport,
        boothChanged,
        booth: savedBooth,
        addedAt,
      };
    });
    if (!saved) return c.json({ error: "not_found" }, 404);
    // Once the transaction has committed, so a line never names a change that was rolled back.
    if (saved.changed) {
      log(saved.added ? "station_added_to_passport" : "station_passport_changed", {
        user_id: c.var.user.id,
        station_id: id,
      });
    }
    // The same line 9.11 writes, so every change of game is in the logs.
    if (saved.givenThePassport) {
      log("station_game_changed", {
        user_id: c.var.user.id,
        station_id: id,
        game: PASSPORT_GAME_ID,
      });
    }
    // And the line 9.12 writes, for a change of the station's booth.
    if (saved.boothChanged) {
      log("station_booth_changed", { user_id: c.var.user.id, station_id: id });
    }
    return c.json(
      {
        passport: {
          station_id: id,
          name,
          location,
          booth: saved.booth,
          points,
          added_at: saved.addedAt,
        },
      },
      saved.added ? 201 : 200,
    );
  });

  return app;
}
