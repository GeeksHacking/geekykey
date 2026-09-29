// Read-only TiDB probe for the db-hosting map (results: tidb-probe.md). Never
// prints the host, user, password or database name: every line is masked first.
//
//   deno run --no-config --allow-net --allow-env=TZ --allow-read=<env file> tidb-probe.ts <env file>

import mysql from "npm:mysql2@3.24.4/promise";
import { connect } from "npm:@tidbcloud/serverless@0.3.0";

/** KEY=VALUE lines, one pair of surrounding quotes stripped, no `$` expansion. */
function readEnvFile(path: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const raw of Deno.readTextFileSync(path).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let value = line.slice(eq + 1).trim();
    const q = value[0];
    if ((q === "'" || q === '"') && value.length >= 2 && value.endsWith(q)) {
      value = value.slice(1, -1);
    }
    vars.set(line.slice(0, eq).trim(), value);
  }
  return vars;
}

const envPath = Deno.args[0];
if (!envPath) {
  console.error("usage: probe.ts <env file>");
  Deno.exit(2);
}
const env = readEnvFile(envPath);
const host = env.get("TIDB_HOST") || "";
const port = Number(env.get("TIDB_PORT") || "4000");
const user = env.get("TIDB_USER") || "";
const password = env.get("TIDB_PASSWORD") || "";
const database = env.get("TIDB_DATABASE") || undefined;
if (!host || !user || !password) {
  console.error(
    "Fill in TIDB_HOST, TIDB_USER and TIDB_PASSWORD in the env file first.",
  );
  Deno.exit(2);
}

// Longest first, so a secret that contains another is masked whole.
const secrets = [password, user, host, database ?? ""]
  .filter((s) => s.length >= 3)
  .sort((a, b) => b.length - a.length);
const mask = (s: string) =>
  secrets.reduce((out, secret) => out.replaceAll(secret, "***"), s);
const say = (...parts: unknown[]) =>
  console.log(
    mask(
      parts.map((p) => typeof p === "string" ? p : JSON.stringify(p)).join(
        " ",
      ),
    ),
  );
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

say("== Where it runs ==");
const gateway = host.match(
  /^gateway\d+\.([a-z0-9-]+)\.prod\.(aws|gcp|alicloud|azure)\.tidbcloud\.com$/,
);
say(
  gateway
    ? `TiDB Cloud shared gateway: region ${gateway[1]} on ${gateway[2]} (Starter/Essential style host)`
    : `Not a shared-gateway host; domain ends in ${
      host.split(".").slice(-3).join(".")
    } (Dedicated or self-hosted?)`,
);
say(
  "Username has a cluster prefix (Starter style):",
  /^[A-Za-z0-9]+\.[^.]+$/.test(user),
);
say("Port:", port, "| database set in env file:", database !== undefined);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

say("\n== TCP connection (mysql2, TLS verified) ==");
let tcpOk = false;
try {
  const t0 = performance.now();
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    connectTimeout: 15_000,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  say(`Connected in ${Math.round(performance.now() - t0)} ms`);
  tcpOk = true;

  const [[version]] = await conn.query(
    "SELECT VERSION() AS version",
  ) as unknown as [[{ version: string }]];
  say("VERSION():", version.version);

  const [[tidb]] = await conn.query(
    "SELECT tidb_version() AS v",
  ) as unknown as [[{ v: string }]];
  for (const line of tidb.v.split("\n")) {
    if (/^(Release Version|Edition|Store):/.test(line)) say(" ", line);
  }

  const [grants] = await conn.query("SHOW GRANTS") as unknown as [
    Record<string, string>[],
  ];
  say("Grants:");
  for (const row of grants) say(" ", Object.values(row)[0]);

  const [dbs] = await conn.query("SHOW DATABASES") as unknown as [
    { Database: string }[],
  ];
  say("Databases visible:", dbs.map((d) => d.Database).join(", "));

  const [vars] = await conn.query(
    "SHOW VARIABLES WHERE Variable_name IN ('tidb_enable_check_constraint', 'time_zone', 'system_time_zone', 'tidb_txn_mode', 'max_allowed_packet')",
  ) as unknown as [{ Variable_name: string; Value: string }[]];
  for (const v of vars) say(` ${v.Variable_name} = ${v.Value}`);

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await conn.query("SELECT 1");
    times.push(performance.now() - t);
  }
  say(
    `SELECT 1 round trip from this machine: median ${
      Math.round(median(times))
    } ms (min ${Math.round(Math.min(...times))})`,
  );
  await conn.end();
} catch (e) {
  say("TCP FAILED:", errText(e));
}

say("\n== Serverless HTTP driver (@tidbcloud/serverless) ==");
try {
  const conn = connect({ host, username: user, password, database });
  const t0 = performance.now();
  const rows = await conn.execute("SELECT VERSION() AS version") as {
    version: string;
  }[];
  say(
    `First query in ${Math.round(performance.now() - t0)} ms:`,
    rows[0]?.version,
  );
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await conn.execute("SELECT 1");
    times.push(performance.now() - t);
  }
  say(
    `SELECT 1 over HTTPS from this machine: median ${
      Math.round(median(times))
    } ms (min ${Math.round(Math.min(...times))})`,
  );
} catch (e) {
  say("HTTP driver FAILED:", errText(e));
}

say("\nTCP ok:", tcpOk);
