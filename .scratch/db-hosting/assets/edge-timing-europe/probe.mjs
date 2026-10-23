#!/usr/bin/env node
// Calls each probe ROUNDS times through the Paris relay,
// and prints one tab-separated line a call: probe, round, when the relay
// sent it (UTC), the whole request in seconds, the HTTP status, the data
// centre that answered, where the probe ran, and its two calls in ms.
//
//   node .scratch/db-hosting/assets/edge-timing-europe/probe.mjs ROUNDS > probe.tsv
import { execFileSync } from "node:child_process";

const europe = "https://bac63-driver-eu.lee-jun-lei-adam.workers.dev";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rounds = Number(process.argv[2]);

console.log(["probe", "round", "sent_at", "total", "http", "colo", "placement", "call_1_ms", "call_2_ms"].join("\t"));
for (let round = 1; round <= rounds; round++) {
  for (const probe of ["local", "placed"]) {
    const url = `https://bac63-probe-${probe}.lee-jun-lei-adam.workers.dev/`;
    const out = execFileSync("curl", ["-sS", "-H", "Content-Type: application/json", "--data-binary", JSON.stringify({ url }), europe], { encoding: "utf8" });
    const answer = JSON.parse(out);
    const calls = JSON.parse(answer.body).calls.map((call) => call.ms);
    console.log([probe, round, answer.sent_at, answer.total.toFixed(3), answer.http, answer.ray.split("-").at(-1), answer.placement ?? "", ...calls].join("\t"));
    await sleep(2000);
  }
}
