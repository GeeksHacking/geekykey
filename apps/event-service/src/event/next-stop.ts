import { and, asc, count, eq, gte, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";
import { passportStations, stations, taps } from "./schema.ts";
import { runsThePassport } from "./stamp-slots.ts";

/**
 * How far back the taps go that tell how quiet a booth is. Long enough to
 * see a queue, short enough to follow the crowd as it moves.
 */
export const NEXT_STOP_WINDOW_MINUTES = 10;

/** A stamp slot a participant can be sent to next. See CONTEXT.md, "Next stop". */
export interface NextStop {
  stationId: string;
  /** Its name in the passport. */
  name: string;
  /** The booth it stands at (the API agreement's 9.12). */
  booth: string;
}

/**
 * The stamp slots anyone can be sent to, quietest first: the fewest stored
 * taps, of any status, received in the last NEXT_STOP_WINDOW_MINUTES before
 * `now`, and between those with as many, the earlier slot. A disabled station
 * and one with no booth are left out, since nobody can be sent there. One
 * read, the same for every participant; nextStop() picks each one's from it.
 * `db` may be an ingest's transaction, whose own taps then count.
 */
export async function quietestFirst(db: Db | Tx, now: Date): Promise<NextStop[]> {
  const since = new Date(now.getTime() - NEXT_STOP_WINDOW_MINUTES * 60_000).toISOString();
  const recent = count(taps.id);
  const rows = await db
    .select({
      stationId: passportStations.stationId,
      name: passportStations.name,
      booth: stations.booth,
    })
    .from(passportStations)
    .innerJoin(
      stations,
      and(
        eq(stations.id, passportStations.stationId),
        runsThePassport,
        isNull(stations.disabledAt),
        isNotNull(stations.booth),
      ),
    )
    .leftJoin(
      taps,
      and(eq(taps.stationId, passportStations.stationId), gte(taps.receivedAt, since)),
    )
    .groupBy(
      passportStations.stationId,
      passportStations.name,
      stations.booth,
      passportStations.addedAt,
    )
    // Slot order breaks a tie, as /me orders the stamps.
    .orderBy(asc(recent), asc(passportStations.addedAt), asc(passportStations.stationId));
  return rows.flatMap(({ booth, ...slot }) => (booth === null ? [] : [{ ...slot, booth }]));
}

/**
 * A participant's next stop: the first of `quietest` (from quietestFirst())
 * whose stamp they don't have, or null once they have every one there is to
 * send them to.
 */
export function nextStop(
  quietest: readonly NextStop[],
  stamped: ReadonlySet<string>,
): NextStop | null {
  return quietest.find((slot) => !stamped.has(slot.stationId)) ?? null;
}
