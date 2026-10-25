import { asc, eq, max } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { passportStations, stations, taps } from "./schema.ts";

/** How recently a station must have been heard from to be online (the API agreement's 9.2). */
const ONLINE_WINDOW_SECONDS = 120;

/** One station on the organizers' station board. */
export interface BoardStation {
  id: string;
  label: string;
  createdAt: string;
  disabledAt: string | null;
  /** Its passport settings, or null for a station not in the passport, whose taps get `no_game`. */
  passport: { name: string; location: string | null; points: number; addedAt: string } | null;
  /** When a tap or a heartbeat last came from it. */
  lastSeenAt: string | null;
  /** Whether `lastSeenAt` is less than ONLINE_WINDOW_SECONDS ago. */
  online: boolean;
  /** From its last heartbeat, or null until one says it. */
  firmwareVersion: string | null;
  bufferedTaps: number | null;
  readerOk: boolean | null;
  /**
   * When the Event Service last received a stored tap from it, whatever its
   * status. Not a QR fallback, which an organizer logs, so a dead reader's
   * last tap still goes stale.
   */
  lastTapAt: string | null;
}

/**
 * Every station this Event Service has registered, enabled or disabled, for
 * the station board, oldest first. `now` decides which are online.
 */
export async function loadStationBoard(db: Db, now: Date): Promise<BoardStation[]> {
  // Each station's newest stored tap from the station itself. ISO strings sort as the times they write.
  const lastTaps = db
    .select({ stationId: taps.stationId, lastTapAt: max(taps.receivedAt).as("last_tap_at") })
    .from(taps)
    .where(eq(taps.source, "nfc"))
    .groupBy(taps.stationId)
    .as("last_taps");

  const rows = await db
    .select({
      station: stations,
      passport: passportStations,
      lastTapAt: lastTaps.lastTapAt,
    })
    .from(stations)
    .leftJoin(passportStations, eq(passportStations.stationId, stations.id))
    .leftJoin(lastTaps, eq(lastTaps.stationId, stations.id))
    .orderBy(asc(stations.createdAt), asc(stations.id));

  const onlineSince = now.getTime() - ONLINE_WINDOW_SECONDS * 1000;
  return rows.map(({ station, passport, lastTapAt }) => ({
    id: station.id,
    label: station.label,
    createdAt: station.createdAt,
    disabledAt: station.disabledAt,
    passport: passport && {
      name: passport.name,
      location: passport.location,
      points: passport.points,
      addedAt: passport.addedAt,
    },
    lastSeenAt: station.lastSeenAt,
    online: station.lastSeenAt !== null && Date.parse(station.lastSeenAt) > onlineSince,
    firmwareVersion: station.firmwareVersion,
    bufferedTaps: station.bufferedTaps,
    readerOk: station.readerOk,
    lastTapAt,
  }));
}
