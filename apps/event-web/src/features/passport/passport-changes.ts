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

/** A new stamp's group page, from the poll that filled it. */
export interface NewStampLink {
  station_id: string;
  name: string;
  link: string;
}

export interface NewStampLinkResult {
  /**
   * True when a stamp filled since the last poll, with or without a link. The screen uses it
   * to clear an earlier offer when the newest new stamp has none.
   */
  changed: boolean;
  /** The newest new stamp with a link, or null. */
  offer: NewStampLink | null;
}

/**
 * The group's page to offer after a new stamp (FRO-89). A first poll has nothing to compare
 * with, and another user signing in is not a stamp, so both find no change. A new stamp
 * without a link still reports `changed`, so the screen can clear the previous offer rather
 * than leave it showing.
 */
export function newStampLink(
  previous: MeResponse | undefined,
  next: MeResponse,
): NewStampLinkResult {
  const { stamped } = passportChanges(previous, next);
  if (stamped.length === 0) return { changed: false, offer: null };

  const newestFirst = next.stamps
    .filter((stamp) => stamped.includes(stamp.station_id))
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""));
  const stamp = newestFirst.find((candidate) => candidate.link !== null);
  if (!stamp || stamp.link === null) return { changed: true, offer: null };

  return {
    changed: true,
    offer: { station_id: stamp.station_id, name: stamp.name, link: stamp.link },
  };
}
