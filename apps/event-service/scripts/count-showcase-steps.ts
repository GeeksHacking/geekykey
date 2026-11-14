/**
 * Prints how far the users created at the showcase got (showcase-steps.ts,
 * BAC-198), from a copy db:backup wrote. It reads the file only and connects
 * to no database, so it can't change one. It prints counts and times, never a
 * name or a user ID, so its output can go into the report.
 *
 *   cd apps/event-service
 *   mise exec -- pnpm db:count-showcase-steps ~/.config/geekykey/copies/<copy>.json \
 *     --leave-out "Adam" --leave-out "Ethan"
 *
 * By default it counts users created on Tue 17 Nov 2026, Singapore time.
 * --from and --to narrow that to the showcase's hours, as ISO times with
 * their offset: --from 2026-11-17T09:00+08:00 --to 2026-11-17T17:00+08:00.
 * Team members' users made before the window are left out by it;
 * --leave-out, given once for each, leaves out any made during it by display name.
 */
import { parseArgs } from "node:util";
import { readCopy } from "./database-copy.ts";
import { showcaseSteps } from "./showcase-steps.ts";

/** The time `value` gives, or an error naming the flag it came from. */
function timeFrom(flag: string, value: string): Date {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`--${flag} ${value} isn't a time. Give one like 2026-11-17T09:00+08:00.`);
  }
  return at;
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: "string", default: "2026-11-17T00:00+08:00" },
      to: { type: "string", default: "2026-11-18T00:00+08:00" },
      "leave-out": { type: "string", multiple: true, default: [] },
    },
  });
  const [file] = positionals;
  if (file === undefined || positionals.length > 1) {
    throw new Error("Give one copy file, from db:backup.");
  }
  const from = timeFrom("from", values.from);
  const to = timeFrom("to", values.to);
  if (from >= to) throw new Error("--from must come before --to.");

  const copy = await readCopy(file);
  for (const line of showcaseSteps(copy, { from, to, leaveOut: values["leave-out"] })) {
    console.log(line);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
