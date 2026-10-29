import type { MeResponse } from "@/api/types";

export interface PassportChanges {
  /** The slots that filled since the last poll, by `station_id`. */
  stamped: readonly string[];
  /** The points before and after, when they went up. */
  points: { from: number; to: number } | null;
}

export const NO_CHANGES: PassportChanges = { stamped: [], points: null };

/**
 * What changed between two polls of /me that the passport should animate. A first poll has
 * nothing to compare with, and a different user signing in isn't a change, so both find
 * nothing. Neither does a slot that is new since the last poll, even one already stamped, or
 * points going down. The screens play what this returns and decide nothing else.
 */
export function passportChanges(
  previous: MeResponse | undefined,
  next: MeResponse,
): PassportChanges {
  if (!previous || previous.user.id !== next.user.id) return NO_CHANGES;
  const wasEarned = new Map(
    previous.stamps.map((stamp) => [stamp.station_id, stamp.earned_at !== null]),
  );
  const stamped = next.stamps
    .filter((stamp) => stamp.earned_at !== null && wasEarned.get(stamp.station_id) === false)
    .map((stamp) => stamp.station_id);
  const points = next.points > previous.points ? { from: previous.points, to: next.points } : null;
  if (stamped.length === 0 && points === null) return NO_CHANGES;
  return { stamped, points };
}
