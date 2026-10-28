import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { COUNTED_TAP_STATUSES, passportStations, stations, taps } from "./schema.ts";
import { runsThePassport } from "./stamp-slots.ts";

/**
 * One station as the map draws it (the API agreement's 9.10). No user ID,
 * display name or token ID, so the map tells nobody where anyone has been.
 */
export interface MapStation {
  stationId: string;
  /** The game it runs, by the game's ID, or null for none. */
  game: string | null;
  /** Its name in the passport while it's a stamp slot, or null. */
  name: string | null;
  /** Its booth from its passport settings, or null. */
  booth: string | null;
  /** Whether an organizer has it disabled. */
  disabled: boolean;
  /**
   * Its `accepted` and `cooldown` taps, from the station and the QR fallback:
   * the taps its game judged. The screen pulses the station when this goes
   * up, so a tap in the cooldown pulses it too. `no_game` taps, stored before
   * it ran a game, aren't counted.
   */
  taps: number;
  /** The users with an accepted tap there, so at a stamp slot the stamps earned there, as in the stats. */
  uniqueParticipants: number;
  /** When the newest tap `taps` counts was received, or null. */
  lastTapAt: string | null;
}

/** The taps the map counts: those a game judged. */
const isCounted = inArray(taps.status, COUNTED_TAP_STATUSES);

/** When a stamp slot's settings were added, which orders the slots, or null for any other station. */
const slotAddedAt = sql`case when ${runsThePassport} then ${passportStations.addedAt} end`;

/**
 * Every station, disabled ones too, with its counts: the stamp slots first,
 * in slot order, then the others, oldest first.
 */
export function loadMap(db: Db): Promise<MapStation[]> {
  return db
    .select({
      stationId: stations.id,
      game: stations.game,
      name: sql<string | null>`case when ${runsThePassport} then ${passportStations.name} end`,
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
    .from(stations)
    .leftJoin(passportStations, eq(passportStations.stationId, stations.id))
    .leftJoin(taps, and(eq(taps.stationId, stations.id), isCounted))
    .groupBy(
      stations.id,
      stations.game,
      stations.disabledAt,
      stations.createdAt,
      passportStations.name,
      passportStations.booth,
      passportStations.addedAt,
    )
    .orderBy(
      sql`${slotAddedAt} is null`,
      asc(slotAddedAt),
      asc(stations.createdAt),
      asc(stations.id),
    );
}
