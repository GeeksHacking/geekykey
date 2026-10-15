import { and, asc, count, desc, eq, min } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, taps } from "./schema.ts";
import type { StoredTapStatus, TapSource } from "./tap-pipeline.ts";

/** How many of their latest taps a participant sees, any status. */
export const RECENT_TAP_LIMIT = 50;

/** A passport station's place in a participant's passport. See CONTEXT.md. */
export interface StampSlot {
  stationId: string;
  name: string;
  location: string | null;
  /** Station points: what one accepted tap there is worth, not what this participant earned there. */
  points: number;
  /** When the Event Service received the first accepted tap there. Null while the slot is empty. */
  earnedAt: string | null;
}

export interface RecentTap {
  id: number;
  stationId: string;
  /** Its name in the passport, or null for a station outside the passport. */
  stationName: string | null;
  status: StoredTapStatus;
  source: TapSource;
  tappedAt: string | null;
  receivedAt: string;
}

/**
 * What GET /api/v1/me shows a signed-in user about themselves, apart from
 * their profile. Their tokens are on the GeekyKey Service's /me instead.
 */
export interface MeView {
  points: number;
  passport: StampSlot[];
  recentTaps: RecentTap[];
}

/**
 * Reads everything /me shows, for one user. Stamps and points are derived from
 * accepted taps here, never stored, so they cannot drift from the tap log.
 *
 * The three reads are independent and sent together. Not with db.batch(): that
 * is libSQL-only. The cost is that each read sees its own moment, so a tap
 * stored mid-request can appear in recentTaps a poll before its stamp does.
 * The next poll catches up.
 */
export async function loadMe(db: Db, userId: string): Promise<MeView> {
  const [passport, visits, recentTaps] = await Promise.all([
    // Only passport stations are stamp slots.
    db
      .select({
        id: passportStations.stationId,
        name: passportStations.name,
        location: passportStations.location,
        points: passportStations.points,
      })
      .from(passportStations)
      // The order they were added keeps every slot in place when a station is added mid-event.
      .orderBy(asc(passportStations.addedAt), asc(passportStations.stationId)),
    // One row per station this participant has an accepted tap at.
    db
      .select({
        stationId: taps.stationId,
        firstAt: min(taps.receivedAt),
        accepted: count(),
      })
      .from(taps)
      .where(and(eq(taps.userId, userId), eq(taps.status, "accepted")))
      .groupBy(taps.stationId),
    // Newest first by arrival. Not by id alone: on TiDB, ids only rise per server.
    db
      .select({
        id: taps.id,
        stationId: taps.stationId,
        stationName: passportStations.name,
        status: taps.status,
        source: taps.source,
        tappedAt: taps.tappedAt,
        receivedAt: taps.receivedAt,
      })
      .from(taps)
      .leftJoin(passportStations, eq(taps.stationId, passportStations.stationId))
      .where(eq(taps.userId, userId))
      .orderBy(desc(taps.receivedAt), desc(taps.id))
      .limit(RECENT_TAP_LIMIT),
  ]);
  const visitsByStation = new Map(visits.map((visit) => [visit.stationId, visit]));

  // Every accepted tap earns its station's points, so a repeat visit after the cooldown counts again.
  const points = passport.reduce(
    (sum, station) => sum + station.points * (visitsByStation.get(station.id)?.accepted ?? 0),
    0,
  );

  return {
    points,
    passport: passport.map((station) => ({
      stationId: station.id,
      name: station.name,
      location: station.location,
      points: station.points,
      earnedAt: visitsByStation.get(station.id)?.firstAt ?? null,
    })),
    recentTaps,
  };
}
