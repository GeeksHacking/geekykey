// Sends the deployed Worker ROUNDS rounds of three requests, one at a time, the
// way the 2 Oct benchmark alternated its cases: the baseline, a check with
// Google's keys cached, and a check fetching them. CPU time comes from
// `wrangler tail` (summarise-tail.ts); this prints the times seen from here.
//
//   node measure.ts <worker URL> <file holding an ID token> [rounds]

import { readFileSync } from "node:fs";

const [base, tokenFile, roundsArg] = process.argv.slice(2);
if (!base || !tokenFile) throw new Error("usage: node measure.ts <worker URL> <token file> [rounds]");
const idToken = readFileSync(tokenFile, "utf8").trim();
const rounds = Number(roundsArg ?? 20);

const cases = {
  noop: () => fetch(`${base}/noop`),
  cached: () => login(`${base}/auth/firebase`),
  fresh: () => login(`${base}/auth/firebase?keys=fresh`),
};

function login(url: string) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
}

const times: Record<string, number[]> = { noop: [], cached: [], fresh: [] };
for (let round = 0; round < rounds; round++) {
  for (const [name, send] of Object.entries(cases)) {
    const started = performance.now();
    const response = await send();
    await response.arrayBuffer();
    times[name]!.push(performance.now() - started);
    if (response.status !== 204) throw new Error(`${name} answered ${response.status}`);
  }
}

for (const [name, values] of Object.entries(times)) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  console.log(
    `${name.padEnd(6)} from the laptop: median ${at(0.5).toFixed(0)} ms, p90 ${at(0.9).toFixed(0)} ms, max ${sorted.at(-1)!.toFixed(0)} ms`,
  );
}
