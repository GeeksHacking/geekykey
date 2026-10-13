/*
  The only place display formatting rules live. Everything here takes the raw
  API value (UTC ISO strings, integers) and returns text.
*/

const LOCALE = "en-GB";

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeWithSecondsFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});

const fullDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatPoints(points: number): string {
  return points === 1 ? "1 pt" : `${points} pts`;
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Shown where a value is absent. A dash is the usual choice, but the copy rules ban
 * em-dash and en-dash in visible text, and a figure dash reads the same. So the word
 * does the work, which also survives a screen reader better than a lone glyph.
 */
const EMPTY = "Not recorded";
/** A table cell with nothing in it. Keeps column width honest without a dash. */
export const EMPTY_CELL = "";

export function formatTime(iso: string): string {
  const date = parseDate(iso);
  return date ? timeFormat.format(date) : EMPTY;
}

export function formatTimeWithSeconds(iso: string): string {
  const date = parseDate(iso);
  return date ? timeWithSecondsFormat.format(date) : EMPTY;
}

export function formatDate(iso: string): string {
  const date = parseDate(iso);
  return date ? fullDateFormat.format(date) : EMPTY;
}

/** "10 Oct, 09:00" */
export function formatDateTime(iso: string): string {
  const date = parseDate(iso);
  if (!date) return EMPTY;
  return `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Yesterday", or "10 Oct 2026". Used as list group headings. */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "Unknown date";
  if (isSameLocalDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return "Yesterday";
  return fullDateFormat.format(date);
}

/** Short relative time for status boards: "just now", "45 s ago", "3 min ago", "2 h ago". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "Unknown";
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
}

/** "Today, 09:00" or "10 Oct, 09:00". Used on stamps and activity rows. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso);
  if (!date) return "Unknown";
  if (isSameLocalDay(date, now)) return `Today, ${timeFormat.format(date)}`;
  return formatDateTime(iso);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

/** "20261010-0900", for file names. */
export function formatFileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
