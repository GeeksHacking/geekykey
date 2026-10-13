// Reads what `wrangler tail --format json` printed during measure.ts, and gives
// each case's CPU and wall time as the Worker saw them.
//
//   node summarise-tail.ts <tail output file>

import { readFileSync } from "node:fs";

interface TailEvent {
  cpuTime: number;
  wallTime: number;
  outcome: string;
  event?: { request?: { url?: string } };
}

const text = readFileSync(process.argv[2]!, "utf8");

// Tail prints one pretty-printed object after another, not one per line.
const events: TailEvent[] = [];
let depth = 0;
let start = -1;
let inString = false;
for (let i = 0; i < text.length; i++) {
  const char = text[i];
  if (inString) {
    if (char === "\\") i++;
    else if (char === '"') inString = false;
  } else if (char === '"') inString = true;
  else if (char === "{" && depth++ === 0) start = i;
  else if (char === "}" && --depth === 0) events.push(JSON.parse(text.slice(start, i + 1)));
}

function caseOf(url = ""): string {
  if (url.endsWith("/noop")) return "noop";
  if (url.endsWith("/auth/firebase")) return "cached";
  if (url.endsWith("/auth/firebase?keys=fresh")) return "fresh";
  return "other";
}

const byCase = new Map<string, TailEvent[]>();
for (const event of events) {
  const name = caseOf(event.event?.request?.url);
  byCase.set(name, [...(byCase.get(name) ?? []), event]);
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return `median ${at(0.5)}, p90 ${at(0.9)}, max ${sorted.at(-1)}`;
}

for (const name of ["noop", "cached", "fresh", "other"]) {
  const list = byCase.get(name);
  if (!list) continue;
  const notOk = list.filter((event) => event.outcome !== "ok").length;
  console.log(
    `${name.padEnd(6)} n=${list.length}  CPU ms: ${stats(list.map((e) => e.cpuTime))}  ` +
      `wall ms: ${stats(list.map((e) => e.wallTime))}${notOk ? `  not ok: ${notOk}` : ""}`,
  );
}
