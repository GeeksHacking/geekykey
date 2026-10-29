/**
 * Timestamp formatting, matching apps/event-web's helpers so a claim time reads the same
 * on both sets of screens. Only what this app needs today; the rest live in
 * apps/event-web/src/lib/format.ts for the Event screens.
 */

const LOCALE = "en-GB";

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today, 09:00" or "10 Oct, 09:00". Used for a token's claimed_at. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "Unknown";
  if (isSameLocalDay(date, now)) return `Today, ${timeFormat.format(date)}`;
  return dateTimeFormat.format(date);
}
