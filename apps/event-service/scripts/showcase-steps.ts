/**
 * How far the users created at the showcase got, read from a copy that
 * db:backup wrote (BAC-198), for the report's C3. It reads only the copy, so
 * it can't change a database, and prints counts and times, never a name or an
 * ID. count-showcase-steps.ts is the command that runs it.
 */
import type { Copy } from "./database-copy.ts";

export interface ShowcaseStepsOptions {
  /** The first moment a user's `created_at` counts. */
  from: Date;
  /** The moment after the last one that counts. */
  to: Date;
  /** Team members' display names, left out whatever their case or spaces. */
  leaveOut: readonly string[];
}

type Row = Record<string, unknown>;

/** A table's rows, or none for a table the copy doesn't have. */
function rowsOf(copy: Copy, table: string): Row[] {
  return copy.tables[table] ?? [];
}

/** A display name as the leave-out list compares it. */
function comparable(name: unknown): string {
  return String(name).trim().toLowerCase();
}

/** Whether an answers row's choices hold an answer. */
function hasAnswer(choices: unknown): boolean {
  return typeof choices === "object" && choices !== null && Object.keys(choices).length > 0;
}

/** Whether a copied column holds a value. */
function present(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/**
 * Each user's earliest time in `times`, from rows giving a user ID and a time. Every time is an
 * ISO string of one length in UTC (src/db/columns.ts), so comparing the strings compares times.
 */
function earliest(times: Map<string, string>, userId: unknown, at: unknown) {
  if (typeof userId !== "string" || typeof at !== "string") return;
  const known = times.get(userId);
  if (known === undefined || at < known) times.set(userId, at);
}

/** The time zone the showcase runs in, which the lines give times in. */
const SHOWCASE_TIME_ZONE = "Asia/Singapore";

const singaporeClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOWCASE_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A moment as Singapore's clocks show it: "Tue 17 Nov 2026, 19:30". */
function singaporeTime(at: Date): string {
  const part = Object.fromEntries(singaporeClock.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.weekday} ${part.day} ${part.month} ${part.year}, ${part.hour}:${part.minute}`;
}

/** A step and each user's earliest time at it. */
interface TimedStep {
  name: string;
  times: Map<string, string>;
}

/** A timed step, or, for one that keeps no time, the users who reached it. */
type Step = TimedStep | { name: string; times: null; reached: Set<unknown> };

/** The lines to print for the users created in the window. */
export function showcaseSteps(copy: Copy, { from, to, leaveOut }: ShowcaseStepsOptions): string[] {
  const leftOut = new Set(leaveOut.map(comparable));
  const inWindow = rowsOf(copy, "users").filter((row) => {
    const created = new Date(String(row.created_at)).getTime();
    return created >= from.getTime() && created < to.getTime();
  });
  const users = inWindow.filter((row) => !leftOut.has(comparable(row.display_name)));

  const answered = new Set(
    rowsOf(copy, "answers")
      .filter((row) => hasAnswer(row.choices))
      .map((row) => row.user_id),
  );
  const joined = new Map<string, string>();
  for (const row of rowsOf(copy, "group_members")) earliest(joined, row.user_id, row.joined_at);
  const connected = new Map<string, string>();
  for (const row of rowsOf(copy, "connections")) {
    earliest(connected, row.user_a, row.connected_at);
    earliest(connected, row.user_b, row.connected_at);
  }

  const named = new Map<string, string>();
  for (const row of users) earliest(named, row.id, row.name_set_at);
  const created = new Map<string, string>();
  for (const row of users) earliest(created, row.id, row.created_at);

  // In the order a person on the screens goes through them. Answers keep no time. Leaving a
  // group, or the organizers' reset, deletes the row (groups.ts), so "joined" means still in
  // the groups or the waiting list when the copy was taken. name_set_at is the last rename.
  const steps: Step[] = [
    { name: "Created", times: created },
    { name: "Named", times: named },
    { name: "Answered", times: null, reached: answered },
    { name: "Joined a group", times: joined },
    { name: "Connected", times: connected },
  ];
  const ids = users.map((row) => String(row.id));

  const lines = [
    `Copy of ${copy.database}, taken ${singaporeTime(new Date(copy.taken_at))} Singapore time`,
    `Users created from ${singaporeTime(from)} to ${singaporeTime(to)} Singapore time`,
    `Left out by name: ${inWindow.length - users.length}`,
    "",
  ];
  // Each timed step's median runs from the timed step before it.
  let before: TimedStep | null = null;
  for (const step of steps) {
    const reached = ids.filter((id) => (step.times === null ? step.reached : step.times).has(id));
    let line = `  ${step.name.padEnd(16)} ${String(reached.length).padStart(4)}`;
    if (step.times === null) {
      line += "   no time kept";
    } else {
      if (before !== null) line += `   ${medianSince(before, step.times, reached)}`;
      before = { name: step.name, times: step.times };
    }
    lines.push(line);
  }

  // A request's time goes when it's accepted, declined or refused (connections.ts), so a
  // copy keeps only the ones still waiting, and this can't be a step between the others.
  const waiting = new Set<unknown>();
  for (const row of rowsOf(copy, "meeting_halves")) {
    // A time with no request ID is a half from before requests, which counts for nothing.
    if (!present(row.request_id)) continue;
    if (present(row.a_met_at)) waiting.add(row.user_a);
    if (present(row.b_met_at)) waiting.add(row.user_b);
  }
  lines.push(
    "",
    `Sent a request still waiting when the copy was taken: ${ids.filter((id) => waiting.has(id)).length}`,
  );
  return lines;
}

/** The median time from `before` to this step, over the users in `reached` who have both. */
function medianSince(before: TimedStep, times: Map<string, string>, reached: string[]): string {
  const gaps = reached
    .filter((id) => before.times.has(id))
    .map((id) => Date.parse(times.get(id)!) - Date.parse(before.times.get(id)!))
    .sort((a, b) => a - b);
  if (gaps.length === 0) return `no user has a time for both this and ${before.name.toLowerCase()}`;
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 1 ? gaps[middle]! : (gaps[middle - 1]! + gaps[middle]!) / 2;
  const users = gaps.length === 1 ? "1 user" : `${gaps.length} users`;
  const order = median < 0 ? "before" : "after";
  return `median ${duration(median)} ${order} ${before.name.toLowerCase()} (${users})`;
}

/** A length of time the way a person says it, with no sign: "45 s", "10 min 30 s", "1 h 5 min". */
function duration(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts =
    h > 0
      ? [`${h} h`, min > 0 ? `${min} min` : ""]
      : min > 0
        ? [`${min} min`, s > 0 ? `${s} s` : ""]
        : [`${s} s`];
  return parts.filter(Boolean).join(" ");
}
