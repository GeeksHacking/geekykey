import { and, asc, count, countDistinct, eq, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, taps } from "./schema.ts";

/** The organizers' totals (the API agreement's 9.5). No token ID: the Event side never sees one. */
export interface EventStats {
  /** Every stored tap: accepted, cooldown and no_game. */
  totalTaps: number;
  acceptedTaps: number;
  /** The users with at least one accepted tap. */
  uniqueParticipants: number;
  /** Each passport station, in stamp-slot order. */
  stations: StationStats[];
}

export interface StationStats {
  stationId: string;
  /** Its name in the passport. */
  name: string;
  acceptedTaps: number;
  /** The users with at least one accepted tap there, so the stamps earned there. */
  uniqueParticipants: number;
}

/** Only accepted taps count for the passport, and so for participants. */
const accepted = sql`${taps.status} = 'accepted'`;

/**
 * Counts the stored taps. The two reads are sent together, so each sees its
 * own moment, and a tap stored mid-request can be in one and not the other.
 * The next poll catches up, as on GET /api/v1/me.
 */
export async function loadStats(db: Db): Promise<EventStats> {
  const [[totals], stations] = await Promise.all([
    db
      .select({
        totalTaps: count(),
        acceptedTaps: sql<number>`count(case when ${accepted} then 1 end)`.mapWith(Number),
        uniqueParticipants:
          sql<number>`count(distinct case when ${accepted} then ${taps.userId} end)`.mapWith(
            Number,
          ),
      })
      .from(taps),
    // Every passport station, with or without accepted taps.
    db
      .select({
        stationId: passportStations.stationId,
        name: passportStations.name,
        acceptedTaps: count(taps.id),
        uniqueParticipants: countDistinct(taps.userId),
      })
      .from(passportStations)
      .leftJoin(
        taps,
        and(eq(taps.stationId, passportStations.stationId), eq(taps.status, "accepted")),
      )
      .groupBy(passportStations.stationId, passportStations.name, passportStations.addedAt)
      // The order they were added, as the passport's stamp slots are.
      .orderBy(asc(passportStations.addedAt), asc(passportStations.stationId)),
  ]);
  return { ...totals!, stations };
}
