/**
 * A device tapped_at further than this from the server's clock is treated as
 * absent, and the tap is judged by its receipt time instead. An ESP32 that
 * never synced its clock reports 1970, and one wild timestamp would otherwise
 * skew that participant's cooldown at the station for good.
 */
const MAX_TAP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // an offline buffer may wait days to flush
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000; // a synced clock can still run a little fast

/**
 * A station's time for a tap, in UTC with milliseconds, or null when it sent
 * none or it's more than 5 minutes ahead of `now` or 7 days behind it. The
 * GeekyKey side applies it before the hand-off, as the API agreement says,
 * and the Event side again, since it can't rely on every caller doing so.
 */
export function trustedTappedAt(tappedAt: string | null | undefined, now: Date): string | null {
  if (!tappedAt) return null;
  const at = Date.parse(tappedAt);
  const drift = at - now.getTime();
  if (Number.isNaN(at) || drift > MAX_CLOCK_AHEAD_MS || -drift > MAX_TAP_AGE_MS) {
    return null;
  }
  return new Date(at).toISOString();
}
