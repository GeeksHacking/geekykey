#!/usr/bin/env node
// Times where a tap's seconds go before it reaches Cloud Run (BAC-38).
//
//   node .scratch/db-hosting/assets/edge-timing.mjs send LABEL ROUNDS [europe] >> results.tsv
//   node .scratch/db-hosting/assets/edge-timing.mjs station LABEL serial.log >> results.tsv
//   node .scratch/db-hosting/assets/edge-timing.mjs match results.tsv > matched.tsv
//   node .scratch/db-hosting/assets/edge-timing.mjs summary matched.tsv [by-colo]
//
// `send` runs ROUNDS rounds from this machine. Each round sends three requests,
// each from a new curl over HTTP/1.1 (as a station does), so each pays for DNS,
// TCP and TLS as a station's first tap does:
//
//   event-api health  GET https://event-api.geekshacking.com/api/health:
//                     Cloudflare's proxy, then Google, then Cloud Run.
//   key-api health    GET https://key-api.geekshacking.com/api/health:
//                     the Worker alone, which never calls Cloud Run.
//   key-api tap       POST /api/v1/taps on key-api with the production test
//                     station's key and the default test token, as a station
//                     sends it. The Worker asks the claims stand-in for the
//                     owner and hands the tap on, both on Cloud Run.
//
// It prints one tab-separated line a request: label, round, request, when it
// was sent (UTC), curl's DNS, TCP, TLS, first byte and total in seconds (each
// counted from the start), the HTTP status, the tap's status, the Cloudflare
// data centre that answered, from the end of its cf-ray header, and the
// cf-placement header, which says where a Worker with placement ran. The key
// and the token's UID come from ~/.config/geekykey/production-test-station.env
// and are never printed.
//
// With `europe` (BAC-63), each request goes through the Paris relay instead
// (edge-timing-europe/), a Worker on Adam's own account that runs near Paris,
// so Cloudflare answers it in Europe whatever network this machine is on. The
// relay's fetches may share a connection, as a station's requests do, so
// there are no DNS, TCP or TLS times, and the sent time and the total are the
// relay's own.
//
// `station` turns a station's serial log, each line stamped with the UTC time
// it arrived, into lines of the same shape, one for each request that sent
// taps.
//
// `match` reads those lines and adds Cloud Run's own latency from its request
// log, for event-service on geekykey-b035a. It needs gcloud signed in with Logs
// Viewer. A health check is matched to the /api/health request that Cloud Run
// received while it was in flight; a tap to the Worker's calls in that time
// (owner lookup, hand-off, and a fill of the stations copy if one ended before
// the owner lookup began), whose latencies are added up, since the Worker
// makes them one after another. Heartbeats and a stale copy's refresh, both
// sent in waitUntil(), are left out. The last column lists each matched call,
// when Cloud Run received it (counted from when the request was sent) and how
// long it took there.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const eventApi = "https://event-api.geekshacking.com";
const keyApi = "https://key-api.geekshacking.com";
const europeRelay = "https://bac63-driver-eu.lee-jun-lei-adam.workers.dev";
const fields = [
  "label", "round", "request", "sent_at", "dns", "tcp", "tls", "first_byte", "total", "http", "tap_status", "colo",
  "placement",
];
const timing =
  "\\n%{time_namelookup}\\t%{time_connect}\\t%{time_appconnect}\\t%{time_starttransfer}\\t%{time_total}\\t%{http_code}\\t%header{cf-ray}\\t%header{cf-placement}";

const coloOf = (ray) => (ray ?? "").split("-").at(-1) || "?";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs curl. The headers and the body (which carry the key and the token's
// UID) go to it as a config file on stdin, so they never show in the process
// list or in an error. Returns the body, curl's timings, the data centre and
// the placement.
function curl(url, { headers = [], body } = {}) {
  const config = headers.map((header) => `header = ${JSON.stringify(header)}`);
  if (body !== undefined) config.push(`data-binary = ${JSON.stringify(body)}`);
  const args = ["-sS", "--http1.1", "-o", "-", "-w", timing, "--config", "-", url];
  const out = execFileSync("curl", args, { input: config.join("\n"), encoding: "utf8" });
  const lines = out.split("\n");
  const times = lines.pop().split("\t");
  const placement = times.pop();
  const colo = coloOf(times.pop());
  return { body: lines.join("\n"), times, colo, placement };
}

// Sends the request through the Paris relay, and returns what curl() does,
// with the relay's sent time. The request, key and all,
// goes to the Worker in curl's body, so the key stays off the process list
// here too.
function fromEurope(url, { headers = [], body } = {}) {
  const request = {
    url,
    method: body === undefined ? "GET" : "POST",
    headers: Object.fromEntries(headers.map((header) => {
      const colon = header.indexOf(":");
      return [header.slice(0, colon), header.slice(colon + 1).trim()];
    })),
    body,
  };
  const answer = JSON.parse(curl(europeRelay, {
    headers: ["Content-Type: application/json"],
    body: JSON.stringify(request),
  }).body);
  return {
    body: answer.body,
    times: ["", "", "", "", answer.total.toFixed(3), String(answer.http)],
    colo: coloOf(answer.ray),
    placement: answer.placement ?? "",
    sentAt: new Date(answer.sent_at),
  };
}

async function send(label, rounds, from) {
  const call = from === "europe" ? fromEurope : curl;
  const env = parseEnv(readFileSync(join(homedir(), ".config/geekykey/production-test-station.env"), "utf8"));
  const { STATION_KEY: key, TOKEN_UID: uid } = env;
  if (!key || !uid) throw new Error("production-test-station.env needs STATION_KEY and TOKEN_UID");

  for (let round = 1; round <= rounds; round++) {
    for (const request of ["event-api health", "key-api health", "key-api tap"]) {
      const sentAt = new Date();
      let result;
      let tapStatus = "";
      if (request === "key-api tap") {
        const tap = { client_tap_id: `bac38-${label}-${round}-${sentAt.getTime()}`, uid, tapped_at: sentAt.toISOString() };
        result = call(`${keyApi}/api/v1/taps`, {
          headers: [`Authorization: Bearer ${key}`, "Content-Type: application/json"],
          body: JSON.stringify({ taps: [tap] }),
        });
        try {
          const answer = JSON.parse(result.body);
          tapStatus = answer.results?.[0]?.status ?? answer.error ?? "";
        } catch {
          tapStatus = "unparsed";
        }
      } else {
        result = call(`${request.startsWith("event") ? eventApi : keyApi}/api/health`);
      }
      const sent = (result.sentAt ?? sentAt).toISOString();
      console.log([label, round, request, sent, ...result.times, tapStatus, result.colo, result.placement].join("\t"));
      await sleep(2000);
    }
    await sleep(3000);
  }
}

// Reads a station's serial log, each line stamped with the UTC time it
// arrived, and prints a line in `send`'s format for each request that sent
// taps: from "Sending N queued tap(s)" to "Backend answered HTTP code". A
// station keeps its connection open, so there are no DNS, TCP or TLS times.
function station(label, file) {
  let sending;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [at, text = ""] = line.split("\t");
    if (text.startsWith("Sending ")) sending = at;
    const answered = /^Backend answered HTTP (-?\d+)/.exec(text);
    if (answered && sending) {
      const total = ((Date.parse(at) - Date.parse(sending)) / 1000).toFixed(3);
      console.log([label, "", "key-api tap", sending, "", "", "", "", total, answered[1], "", "", ""].join("\t"));
      sending = undefined;
    }
  }
}

const seconds = (latency) => Number(String(latency ?? "").replace(/s$/, "")) || 0;

// Reads tab-separated lines into objects keyed by `names`.
const readRows = (lines, names) =>
  lines.map((line) => Object.fromEntries(line.split("\t").map((value, i) => [names[i], value])));

function match(file) {
  const rows = readRows(readFileSync(file, "utf8").trim().split("\n"), fields);
  const sentTimes = rows.map((row) => Date.parse(row.sent_at));
  const from = new Date(Math.min(...sentTimes) - 5000).toISOString();
  const to = new Date(Math.max(...sentTimes) + 30000).toISOString();
  const filter = [
    'resource.type="cloud_run_revision"',
    'resource.labels.service_name="event-service"',
    'logName:"requests"',
    `timestamp>="${from}"`,
    `timestamp<="${to}"`,
  ].join(" AND ");
  const entries = JSON.parse(execFileSync("gcloud", [
    "logging", "read", filter, "--project=geekykey-b035a", "--limit=5000", "--order=asc", "--format=json",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))
    .map((entry) => ({
      at: Date.parse(entry.timestamp),
      path: new URL(entry.httpRequest.requestUrl).pathname,
      latency: seconds(entry.httpRequest.latency),
    }));

  console.log([...fields, "cloud_run", "before_cloud_run", "cloud_run_requests"].join("\t"));
  for (const row of rows) {
    // Google's clock and this machine's can differ by a little, so the window
    // starts half a second early.
    const start = Date.parse(row.sent_at) - 500;
    const end = Date.parse(row.sent_at) + Number(row.total) * 1000 + 500;
    const during = entries.filter((entry) => entry.at >= start && entry.at <= end);
    let matched = [];
    if (row.request === "event-api health") matched = during.filter((entry) => entry.path === "/api/health").slice(0, 1);
    if (row.request === "key-api tap") {
      matched = during.filter((entry) => entry.path !== "/api/health" && !entry.path.endsWith("/heartbeats"));
      // A fill of an empty stations copy ends before the owner lookup starts,
      // and holds the tap up. A stale copy's refresh runs beside the lookup.
      const owners = matched.find((entry) => entry.path.endsWith("/owners"));
      matched = matched.filter((entry) =>
        !entry.path.endsWith("/stations") || (owners && entry.at + entry.latency * 1000 <= owners.at));
    }
    const cloudRun = matched.reduce((sum, entry) => sum + entry.latency, 0);
    const cloudRunKnown = row.request === "key-api health" || matched.length > 0;
    // Each call: when Cloud Run received it, counted from when the request
    // was sent, and how long Cloud Run took.
    const calls = matched.map((entry) =>
      `${entry.path} at +${((entry.at - Date.parse(row.sent_at)) / 1000).toFixed(3)} took ${entry.latency.toFixed(3)}`);
    console.log([
      ...fields.map((field) => row[field]),
      cloudRunKnown ? cloudRun.toFixed(3) : "",
      cloudRunKnown ? (Number(row.total) - cloudRun).toFixed(3) : "",
      calls.join(", "),
    ].join("\t"));
  }
}

// Prints, for each label and request in `match`'s output, the median and the
// range of each time over the requests that got a 2xx, how many didn't, and
// which Cloudflare data centres answered. With by-colo, each data centre gets
// its own line.
function summary(file, byColo) {
  const [header, ...lines] = readFileSync(file, "utf8").trim().split("\n");
  const rows = readRows(lines, header.split("\t"));
  const medianAndRange = (values) => {
    const sorted = values.filter((value) => value !== "").map(Number).sort((a, b) => a - b);
    if (sorted.length === 0) return "";
    const median = sorted[Math.floor(sorted.length / 2)];
    return `${median.toFixed(2)} (${sorted[0].toFixed(2)}-${sorted.at(-1).toFixed(2)})`;
  };
  const groups = Map.groupBy(rows, (row) => `${row.label}\t${row.request}${byColo ? ` ${row.colo}` : ""}`);
  console.log(["label", "request", "n", "failed", "tcp", "tls", "total", "cloud_run", "before_cloud_run", "colos", "placements"].join("\t"));
  for (const [key, group] of groups) {
    const answered = group.filter((row) => row.http.startsWith("2"));
    const colos = Object.entries(Object.groupBy(answered, (row) => row.colo))
      .map(([colo, inColo]) => `${colo} ${inColo.length}`).join(", ");
    const placements = Object.entries(Object.groupBy(answered, (row) => row.placement || "none"))
      .map(([placement, inPlacement]) => `${placement} ${inPlacement.length}`).join(", ");
    console.log([
      key, answered.length, group.length - answered.length,
      ...["tcp", "tls", "total", "cloud_run", "before_cloud_run"].map((name) => medianAndRange(answered.map((row) => row[name] ?? ""))),
      colos, placements,
    ].join("\t"));
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "send") await send(args[0], Number(args[1]), args[2]);
else if (command === "match") match(args[0]);
else if (command === "station") station(args[0], args[1]);
else if (command === "summary") summary(args[0], args[1] === "by-colo");
else throw new Error("usage: edge-timing.mjs send LABEL ROUNDS [europe] | station LABEL SERIAL_LOG | match FILE | summary MATCHED_FILE [by-colo]");
