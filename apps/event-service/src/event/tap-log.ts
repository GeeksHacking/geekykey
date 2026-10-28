import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, stations, taps, users } from "./schema.ts";
import { runsThePassport } from "./stamp-slots.ts";
import type { StoredTapStatus, TapSource } from "./tap-pipeline.ts";

/** One stored tap in the organizers' scan log. No token ID: the Event side never sees one. */
export interface LoggedTap {
  id: number;
  clientTapId: string;
  stationId: string;
  /** Its name in the passport, or null for a station that isn't a stamp slot. */
  stationName: string | null;
  userId: string;
  /** The name the event shows, or null for someone who has never logged in to this event. */
  displayName: string | null;
  status: StoredTapStatus;
  source: TapSource;
  tappedAt: string | null;
  receivedAt: string;
}

/** Which page of the scan log to read (the API agreement's 9.3). */
export interface TapLogQuery {
  /** The most taps to return. */
  limit: number;
  /** Only taps with a lower ID than this, for "load more". */
  beforeId?: number;
  /** Only taps at this station. */
  stationId?: string;
  /** Only taps with this status. */
  status?: StoredTapStatus;
}

/** One page of the scan log, and the cursor for the next, or null when there are no older taps. */
export interface TapLogPage {
  taps: LoggedTap[];
  nextBeforeId: number | null;
}

/**
 * Every stored tap with its station's passport name, while the station is a
 * stamp slot, and its user's display name, for the scan log and the export to
 * narrow and order.
 */
export function selectLoggedTaps(db: Db) {
  return (
    db
      .select({
        id: taps.id,
        clientTapId: taps.clientTapId,
        stationId: taps.stationId,
        stationName: passportStations.name,
        userId: taps.userId,
        displayName: users.displayName,
        status: taps.status,
        source: taps.source,
        tappedAt: taps.tappedAt,
        receivedAt: taps.receivedAt,
      })
      .from(taps)
      .innerJoin(stations, eq(stations.id, taps.stationId))
      // A name only for a stamp slot.
      .leftJoin(
        passportStations,
        and(eq(passportStations.stationId, taps.stationId), runsThePassport),
      )
      .leftJoin(users, eq(users.id, taps.userId))
      .$dynamic()
  );
}

/**
 * The stored taps, newest first. By ID, which the before_id cursor pages by:
 * the taps table's AUTO_ID_CACHE=1 makes a newer tap's ID always higher.
 */
export async function loadTapLog(
  db: Db,
  { limit, beforeId, stationId, status }: TapLogQuery,
): Promise<TapLogPage> {
  const rows = await selectLoggedTaps(db)
    .where(
      and(
        beforeId === undefined ? undefined : lt(taps.id, beforeId),
        stationId === undefined ? undefined : eq(taps.stationId, stationId),
        status === undefined ? undefined : eq(taps.status, status),
      ),
    )
    .orderBy(desc(taps.id))
    // One more than asked for, to tell whether there are older taps.
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return { taps: page, nextBeforeId: rows.length > limit ? page.at(-1)!.id : null };
}
