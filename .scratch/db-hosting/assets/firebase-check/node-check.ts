// The same check on Node, as the Event Service on Cloud Run will run it. CPU
// time per check from process.cpuUsage(), with Google's keys cached (one key
// set, fetched before the timing starts) and not (a new key set each time, so
// each check includes fetching and reading Google's keys).
//
//   node node-check.ts <file holding an ID token>

import { readFileSync } from "node:fs";
import {
  googleSigningKeys,
  verifyFirebaseIdToken,
} from "../../../../apps/backend/src/lib/firebase-id-token.ts";

const idToken = readFileSync(process.argv[2]!, "utf8").trim();
const projectId = "geekykey-b035a";

async function cpuMs(check: () => Promise<unknown>): Promise<number> {
  const before = process.cpuUsage();
  const identity = await check();
  if (!identity) throw new Error("the token didn't verify");
  const { user, system } = process.cpuUsage(before);
  return (user + system) / 1000;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return `median ${at(0.5).toFixed(2)}, p90 ${at(0.9).toFixed(2)}, max ${sorted.at(-1)!.toFixed(2)}`;
}

const keys = googleSigningKeys();
const first = await cpuMs(() => verifyFirebaseIdToken(idToken, { projectId, keys }));

const cached: number[] = [];
for (let i = 0; i < 200; i++) {
  cached.push(await cpuMs(() => verifyFirebaseIdToken(idToken, { projectId, keys })));
}

const fresh: number[] = [];
for (let i = 0; i < 20; i++) {
  const freshKeys = googleSigningKeys();
  fresh.push(await cpuMs(() => verifyFirebaseIdToken(idToken, { projectId, keys: freshKeys })));
}

console.log(`Node ${process.version}`);
console.log(`first check, cold process: ${first.toFixed(2)} ms CPU`);
console.log(`cached keys, n=200: CPU ms ${stats(cached)}`);
console.log(`fresh keys,  n=20:  CPU ms ${stats(fresh)}`);
