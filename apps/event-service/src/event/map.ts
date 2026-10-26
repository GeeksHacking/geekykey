import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, stations, taps } from "./schema.ts";

/**
 * One passport station as the map on the big screen draws it (the API
 * agreement's 9.10). No user ID, display name or token ID, so the map tells
 * nobody where anyone has been.
 */
export interface MapStation {
  stationId: string;
  /** Its name in the passport. */
  name: string;
  /** Its booth from its passport settings, or null. */
  booth: string | null;
  /** Whether an organizer has it disabled. */
  disabled: boolean;
  /**
   * Its `accepted` and `cooldown` taps, from the station and the QR fallback.
   * The screen pulses the station when this goes up, so a tap in the
   * cooldown pulses it too. `no_game` taps, stored before it joined the
   * passport, aren't counted.
   */
  taps: number;
  /** The users with an accepted tap there, so the stamps earned there, as in the stats. */
  uniqueParticipants: number;
  /** When the newest tap `taps` counts was received, or null. */
  lastTapAt: string | null;
}

/** The taps the map counts: those the passport judged. */
const isCounted = inArray(taps.status, ["accepted", "cooldown"]);

/** Every passport station, disabled ones too, in stamp-slot order, with its counts. */
export function loadMap(db: Db): Promise<MapStation[]> {
  return (
    db
      .select({
        stationId: passportStations.stationId,
        name: passportStations.name,
        booth: passportStations.booth,
        disabled: sql<boolean>`${stations.disabledAt} is not null`.mapWith(Boolean),
        taps: count(taps.id),
        uniqueParticipants:
          sql<number>`count(distinct case when ${taps.status} = 'accepted' then ${taps.userId} end)`.mapWith(
            Number,
          ),
        // ISO strings sort as the times they write.
        lastTapAt: max(taps.receivedAt),
      })
      .from(passportStations)
      .innerJoin(stations, eq(stations.id, passportStations.stationId))
      .leftJoin(taps, and(eq(taps.stationId, passportStations.stationId), isCounted))
      .groupBy(
        passportStations.stationId,
        passportStations.name,
        passportStations.booth,
        passportStations.addedAt,
        stations.disabledAt,
      )
      // The order they were added, as the passport's stamp slots are.
      .orderBy(asc(passportStations.addedAt), asc(passportStations.stationId))
  );
}
