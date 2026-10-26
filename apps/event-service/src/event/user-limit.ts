/** How many requests a minute each user gets (the API agreement's section 2, "Rate limits"). */
export const USER_REQUESTS_PER_MINUTE = 60;

const MINUTE_MS = 60_000;

/** Counts each user's requests to the API, and says when one is over the limit. */
export interface UserLimit {
  /** Counts one request by `userId`, and answers false once they're over the limit. */
  allow(userId: string): boolean;
}

/**
 * The Event Service's limit on each user, counted in this server instance's
 * memory, since Cloud Run has no rate limiting of its own (the migration
 * spec's section 5.1). Each instance counts separately, so with two running,
 * one user can get up to twice the limit through. That's accepted: the limit
 * guards against a runaway or hostile sender, and isn't an exact count.
 *
 * A user's minute starts at their first request, and their first request
 * after it ends starts a new minute with a fresh count.
 *
 * Built once for the server's life, in src/app.ts, on the app's clock.
 */
export function userLimit(now: () => Date = () => new Date()): UserLimit {
  const minutes = new Map<string, { startedAt: number; count: number }>();
  let lastSweepAt = 0;

  return {
    allow(userId) {
      const at = now().getTime();
      // Once a minute, forget every user whose minute has ended, so the map
      // holds only the users of the last minute or two.
      if (at - lastSweepAt >= MINUTE_MS) {
        for (const [id, minute] of minutes) {
          if (at - minute.startedAt >= MINUTE_MS) minutes.delete(id);
        }
        lastSweepAt = at;
      }

      let minute = minutes.get(userId);
      if (!minute || at - minute.startedAt >= MINUTE_MS) {
        minute = { startedAt: at, count: 0 };
        minutes.set(userId, minute);
      }
      minute.count += 1;
      return minute.count <= USER_REQUESTS_PER_MINUTE;
    },
  };
}
