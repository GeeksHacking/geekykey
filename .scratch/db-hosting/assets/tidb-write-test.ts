// Write test for "How is the database set up?" (results: tidb-write-test.md). Creates a
// throwaway database, runs four checks, and drops it again. Never prints the host, user or
// password: every line is masked first. Ignores TIDB_DATABASE. Leaves cluster settings alone.
//
//   deno run --no-config --allow-net --allow-env=TZ --allow-read=<env file> tidb-write-test.ts <env file>

import mysql from "npm:mysql2@3.24.4/promise";

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
  console.error("usage: tidb-write-test.ts <env file>");
  Deno.exit(2);
}
const env = readEnvFile(envPath);
const host = env.get("TIDB_HOST") || "";
const port = Number(env.get("TIDB_PORT") || "4000");
const user = env.get("TIDB_USER") || "";
const password = env.get("TIDB_PASSWORD") || "";
if (!host || !user || !password) {
  console.error(
    "Fill in TIDB_HOST, TIDB_USER and TIDB_PASSWORD in the env file first.",
  );
  Deno.exit(2);
}

// Longest first, so a secret that contains another is masked whole.
const secrets = [password, user, host]
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const scratch = `gk_write_test_${Date.now()}`;
const open = (database?: string) =>
  mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    connectTimeout: 15_000,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
type Conn = Awaited<ReturnType<typeof open>>;
const rows = async <T>(conn: Conn, sql: string, values: unknown[] = []) =>
  (await conn.query(sql, values))[0] as unknown as T[];

const admin = await open();
let created = false;
try {
  say("== Strict mode (does ENUM reject a bad value?) ==");
  const [modes] = await rows<{ session: string; global: string }>(
    admin,
    "SELECT @@SESSION.sql_mode AS session, @@GLOBAL.sql_mode AS global",
  );
  say("session sql_mode:", modes.session);
  say("global sql_mode: ", modes.global);

  await admin.query(`CREATE DATABASE \`${scratch}\``);
  created = true;
  say(`\nCreated throwaway database ${scratch}`);

  const a = await open(scratch);
  const b = await open(scratch);
  const c = await open(scratch);
  try {
    await a.query(
      "CREATE TABLE enum_check (status ENUM('accepted','cooldown') NOT NULL)",
    );
    await a.query("INSERT INTO enum_check VALUES ('accepted')");
    say("Good value inserted: yes");
    try {
      await a.query("INSERT INTO enum_check VALUES ('bogus')");
      const stored = await rows<{ status: string }>(
        a,
        "SELECT status FROM enum_check",
      );
      say("Bad value REJECTED: no. Stored:", stored.map((r) => r.status));
    } catch (e) {
      say("Bad value rejected: yes:", errText(e));
    }

    say("\n== AUTO_ID_CACHE 1 (do ids rise across connections?) ==");
    await a.query(
      "CREATE TABLE ids_default (id BIGINT AUTO_INCREMENT PRIMARY KEY, n INT NOT NULL)",
    );
    await a.query(
      "CREATE TABLE ids_cache1 (id BIGINT AUTO_INCREMENT PRIMARY KEY, n INT NOT NULL) AUTO_ID_CACHE 1",
    );
    const [ddl] = await rows<Record<string, string>>(
      a,
      "SHOW CREATE TABLE ids_cache1",
    );
    const createSql = Object.values(ddl)[1] ?? "";
    say(
      "AUTO_ID_CACHE 1 kept in SHOW CREATE TABLE:",
      /AUTO_ID_CACHE\s*=?\s*1\b/i.test(createSql),
    );
    // Three connections take turns inserting. Each may reach a different TiDB server.
    for (const table of ["ids_default", "ids_cache1"]) {
      const conns = [a, b, c];
      for (let n = 0; n < 12; n++) {
        await conns[n % 3].query(`INSERT INTO ${table} (n) VALUES (?)`, [n]);
      }
      const got = await rows<{ id: number }>(
        a,
        `SELECT id FROM ${table} ORDER BY n`,
      );
      const ids = got.map((r) => Number(r.id));
      const rising = ids.every((id, i) => i === 0 || id > ids[i - 1]);
      say(
        `${table}: ids in insert order ${
          ids.join(", ")
        }; always rising: ${rising}`,
      );
    }

    say("\n== SELECT ... FOR UPDATE (does a second connection wait?) ==");
    await a.query("CREATE TABLE station_lock (id VARCHAR(36) PRIMARY KEY)");
    await a.query("INSERT INTO station_lock VALUES ('st-1')");
    await a.query("BEGIN");
    await a.query("SELECT id FROM station_lock WHERE id = 'st-1' FOR UPDATE");
    await b.query("BEGIN");
    const t0 = performance.now();
    const waited = b
      .query("SELECT id FROM station_lock WHERE id = 'st-1' FOR UPDATE")
      .then(() => performance.now() - t0);
    await sleep(1500);
    await a.query("COMMIT");
    const waitMs = Math.round(await waited);
    await b.query("COMMIT");
    say(
      `Second connection got the lock after ${waitMs} ms (the first held it about 1500 ms)`,
    );

    say(
      "\n== Duplicate key: no-op ON DUPLICATE KEY UPDATE, then INSERT IGNORE ==",
    );
    await a.query(
      "CREATE TABLE dup_check (station_id VARCHAR(36) NOT NULL, client_tap_id VARCHAR(64) NOT NULL, status ENUM('accepted','cooldown') NOT NULL, UNIQUE KEY (station_id, client_tap_id))",
    );
    await a.query("INSERT INTO dup_check VALUES ('st-1', 'tap-1', 'accepted')");
    const [noop] = await a.query(
      "INSERT INTO dup_check VALUES ('st-1', 'tap-1', 'cooldown') ON DUPLICATE KEY UPDATE client_tap_id = client_tap_id",
    ) as unknown as [{ affectedRows: number }];
    const [kept] = await rows<{ status: string }>(
      a,
      "SELECT status FROM dup_check WHERE client_tap_id = 'tap-1'",
    );
    say(
      `No-op update on a replay: no error, affectedRows ${noop.affectedRows}, stored status still ${kept.status}`,
    );
    try {
      const [ignored] = await a.query(
        "INSERT IGNORE INTO dup_check VALUES ('st-1', 'tap-2', 'bogus')",
      ) as unknown as [{ affectedRows: number; warningStatus: number }];
      const stored = await rows<{ status: string }>(
        a,
        "SELECT status FROM dup_check WHERE client_tap_id = 'tap-2'",
      );
      say(
        `INSERT IGNORE with a bad ENUM value: no error, affectedRows ${ignored.affectedRows}, warnings ${ignored.warningStatus}, stored ${
          JSON.stringify(stored.map((r) => r.status))
        }`,
      );
    } catch (e) {
      say("INSERT IGNORE with a bad ENUM value: rejected:", errText(e));
    }
  } finally {
    await Promise.allSettled([a.end(), b.end(), c.end()]);
  }
} catch (e) {
  say("FAILED:", errText(e));
} finally {
  if (created) {
    await admin.query(`DROP DATABASE \`${scratch}\``);
    say(`\nDropped ${scratch}`);
  }
  await admin.end();
}
