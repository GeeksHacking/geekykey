import { asc, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { COUNTED_TAP_STATUSES, passportStations, stations, taps } from "./schema.ts";

/** How recently a station must have been heard from to be online (the API agreement's 9.2). */
const ONLINE_WINDOW_SECONDS = 120;

/** One station on the organizers' station board. */
export interface BoardStation {
  id: string;
  label: string;
  createdAt: string;
  disabledAt: string | null;
  /** The game it runs, by the game's ID, or null for none (9.11). */
  game: string | null;
  /**
   * Whether its game can no longer change: it has a stored tap that a game
   * counted or held back, from the station or the QR fallback (9.11).
   */
  gameFixed: boolean;
  /** Its passport settings, or null for a station not in the passport, whose taps get `no_game`. */
  passport: {
    name: string;
    location: string | null;
    /** Where the map draws it (9.10), or null. */
    booth: string | null;
    points: number;
    addedAt: string;
  } | null;
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
export function loadStationBoard(db: Db, now: Date): Promise<BoardStation[]> {
  return loadBoardStations(db, now);
}

/**
 * One station as the board lists it, for the answers that change a station
 * (the API agreement's 9.7 to 9.9), or null when there is no such station.
 */
export async function loadBoardStation(
  db: Db,
  now: Date,
  stationId: string,
): Promise<BoardStation | null> {
  const [station] = await loadBoardStations(db, now, eq(stations.id, stationId));
  return station ?? null;
}

async function loadBoardStations(db: Db, now: Date, where?: SQL): Promise<BoardStation[]> {
  // Each station's newest stored tap from the station itself. ISO strings sort as the times they write.
  const lastTaps = db
    .select({ stationId: taps.stationId, lastTapAt: max(taps.receivedAt).as("last_tap_at") })
    .from(taps)
    .where(eq(taps.source, "nfc"))
    .groupBy(taps.stationId)
    .as("last_taps");

  // The stations with a tap a game counted or held back, whose game is fixed.
  const countedTaps = db
    .selectDistinct({ stationId: taps.stationId })
    .from(taps)
    .where(inArray(taps.status, COUNTED_TAP_STATUSES))
    .as("counted_taps");

  const rows = await db
    .select({
      station: stations,
      passport: passportStations,
      lastTapAt: lastTaps.lastTapAt,
      gameFixed: sql<boolean>`${countedTaps.stationId} is not null`.mapWith(Boolean),
    })
    .from(stations)
    .leftJoin(passportStations, eq(passportStations.stationId, stations.id))
    .leftJoin(lastTaps, eq(lastTaps.stationId, stations.id))
    .leftJoin(countedTaps, eq(countedTaps.stationId, stations.id))
    .where(where)
    .orderBy(asc(stations.createdAt), asc(stations.id));

  const onlineSince = now.getTime() - ONLINE_WINDOW_SECONDS * 1000;
  return rows.map(({ station, passport, lastTapAt, gameFixed }) => ({
    id: station.id,
    label: station.label,
    createdAt: station.createdAt,
    disabledAt: station.disabledAt,
    game: station.game,
    gameFixed,
    passport: passport && {
      name: passport.name,
      location: passport.location,
      booth: passport.booth,
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
