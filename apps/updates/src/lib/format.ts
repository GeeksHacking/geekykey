/*
  Entry dates are calendar days. YAML reads `2026-09-23` as midnight UTC, so everything
  here reads the UTC fields; local time would shift a date by a day in some timezones.
  Month names are written out rather than taken from Intl, whose British short form for
  September is "Sept" in some Node versions and "Sep" in others.
*/
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parts = (d: Date) => ({
  day: d.getUTCDate(),
  month: MONTHS[d.getUTCMonth()],
  year: d.getUTCFullYear(),
});

/** 23 Sep 2026, or 23 Sep with `year: false`. */
export function formatDay(d: Date, { year = true } = {}): string {
  const p = parts(d);
  return year ? `${p.day} ${p.month} ${p.year}` : `${p.day} ${p.month}`;
}

/**
 * 18-23 Sep 2026, 28 Sep - 4 Oct 2026, or 29 Dec 2025 - 4 Jan 2026. Hyphens only: the
 * design rules ban en dashes, ranges included. `year: false` drops the year where the
 * context already gives it, such as the schedule strip.
 */
export function formatRange(from: Date, to: Date, { year = true } = {}): string {
  const a = parts(from);
  const b = parts(to);
  const y = year ? ` ${b.year}` : "";
  if (a.year !== b.year) return `${formatDay(from)} - ${formatDay(to)}`;
  if (a.month !== b.month) return `${a.day} ${a.month} - ${b.day} ${b.month}${y}`;
  if (a.day !== b.day) return `${a.day}-${b.day} ${b.month}${y}`;
  return formatDay(to, { year });
}

/** 2026-09-23, for <time datetime>. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Adam", "Adam and Ethan", "Adam, Zi Tao and Ethan" */
export function formatList(items: string[]): string {
  return new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(items);
}

/**
 * Curly quotes and apostrophes for front matter. The Markdown renderer does this for an
 * entry's body, but front matter is plain YAML, so without this a title or summary would
 * show "Thursday's" with a straight apostrophe on the same page as curly ones.
 */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s([{])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}
