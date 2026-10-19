/**
 * The end-to-end smoke test (the migration spec's checkpoint 4, "CI"). It
 * starts the Event Service on Node and the GeekyKey Service in `wrangler dev`,
 * adds a registered station and a claimed token to geekykey_test, and sends a
 * station's requests through the Worker. Each check reads the database itself,
 * not only the answer, since a tap can be answered `accepted` by one side and
 * lost by the other.
 *
 *   mise run db:up
 *   mise run test:smoke
 *
 * CI runs it on every pull request, whichever app it touches, since a change
 * on either side can break the hand-off between them. It lives with the Event
 * Service because it needs its database code to add the rows and read them
 * back. It's a node:test script rather than a Vitest file, since the Event
 * Service's Vitest setup empties geekykey_test before each test, under the
 * running services.
 *
 * Both services get fresh random keys, so a laptop's .env or .dev.vars can't
 * change what's tested, and the ports are 8100 and 8101, so it runs beside
 * `pnpm dev` on 8000 and 8001. Their output is printed as it comes, each line
 * marked with the service's name.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { stations, taps } from "../src/event/schema.ts";
import { normaliseUid } from "../src/lib/token-uid.ts";
import { localDatabaseUrl } from "./local-tidb.ts";
import { addParticipant, addStation } from "./seed-rows.ts";

const EVENT_SERVICE_PORT = 8101;
const WORKER_PORT = 8100;
const eventServiceUrl = `http://127.0.0.1:${EVENT_SERVICE_PORT}`;
const workerUrl = `http://127.0.0.1:${WORKER_PORT}`;

/** How long each service has to answer /api/health after it's started. */
const START_TIMEOUT_MS = 60_000;
/** How long the heartbeat hand-off, which runs after the station's answer, has to reach the database. */
const HEARTBEAT_TIMEOUT_MS = 10_000;

const appsDir = join(import.meta.dirname, "..", "..");

/** 64 lower-case hex characters, as `openssl rand -hex 32` writes them. */
const randomKey = () => randomBytes(32).toString("hex");

const eventServiceKey = randomKey();
const claimsStandInKey = randomKey();

/** A made-up token UID: seven bytes starting 04, the shape of an NTAG213's. */
const randomUid = () => normaliseUid(`04${randomBytes(6).toString("hex")}`);

/** A new client_tap_id, so no tap is ever a replay of another run's. */
const randomClientTapId = () => `smoke-${randomBytes(4).toString("hex")}`;

const connection = await createConnection(localDatabaseUrl("geekykey_test"));
const db = drizzle({ client: connection });

const participantId = "smoke-test-participant";
const claimedUid = randomUid();
let station: { id: string; key: string };

let eventService: ChildProcess | undefined;
let worker: ChildProcess | undefined;
let workerSettingsDir: string | undefined;

before(async () => {
  // A new station each run, so a tap never meets the cooldown of the last run's.
  station = await addStation(db, { label: "Smoke test station" });
  await addParticipant(db, {
    id: participantId,
    displayName: "Smoke test participant",
    uid: claimedUid,
  });

  // As on Cloud Run, with dev sign-in off.
  eventService = start("event-service", "node", ["src/server.ts"], {
    cwd: join(appsDir, "event-service"),
    env: {
      ...process.env,
      DEV_AUTH_ENABLED: "false",
      PORT: String(EVENT_SERVICE_PORT),
      DATABASE_URL: localDatabaseUrl("geekykey_test"),
      SESSION_SECRET: randomKey(),
      CLAIMS_STAND_IN_KEY: claimsStandInKey,
      EVENT_SERVICE_KEY: eventServiceKey,
    },
  });

  // `wrangler dev --env-file` reads the Worker's settings from that file and
  // skips .dev.vars. It also reads the shell's variables, which win over the
  // file, so these names are taken out of the environment it inherits.
  const workerSettings = {
    SESSION_SECRET: randomKey(),
    CLAIMS_STAND_IN_KEY: claimsStandInKey,
    EVENT_SERVICE_KEY_SHOWCASE: eventServiceKey,
    EVENT_SERVICES: JSON.stringify([
      { id: "showcase", name: "Capstone Showcase", url: eventServiceUrl },
    ]),
    CLAIMS_STAND_IN_URL: `${eventServiceUrl}/claims-stand-in/v1`,
  };
  workerSettingsDir = await mkdtemp(join(tmpdir(), "geekykey-smoke-"));
  const envFile = join(workerSettingsDir, "worker.env");
  await writeFile(
    envFile,
    Object.entries(workerSettings)
      .map(([name, value]) => `${name}='${value}'`)
      .join("\n"),
  );
  const workerEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(workerSettings)) delete workerEnv[name];
  worker = start(
    "geekykey-service",
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(WORKER_PORT),
      "--env-file",
      envFile,
      "--show-interactive-dev-session=false",
    ],
    { cwd: join(appsDir, "geekykey-service"), env: workerEnv },
  );

  await Promise.all([
    waitForHealth("event-service", eventServiceUrl, eventService),
    waitForHealth("geekykey-service", workerUrl, worker),
  ]);
});

after(async () => {
  for (const child of [eventService, worker]) if (child) stop(child);
  await connection.end();
  if (workerSettingsDir) await rm(workerSettingsDir, { recursive: true, force: true });
});

test("a tap by a claimed token is stored with its owner's user ID", async () => {
  const clientTapId = randomClientTapId();
  // A minute ago, so the hand-off carries the station's time rather than null.
  const tappedAt = new Date(Date.now() - 60_000).toISOString();
  const answer = await postAsStation("/api/v1/taps", {
    taps: [{ client_tap_id: clientTapId, uid: claimedUid, tapped_at: tappedAt }],
  });
  assert.deepEqual(answer, {
    station_id: station.id,
    results: [{ client_tap_id: clientTapId, status: "accepted" }],
  });

  const stored = await storedTaps(clientTapId);
  assert.deepEqual(stored, [{ userId: participantId, status: "accepted", tappedAt }]);
});

test("a tap by an unclaimed token gets unknown_token, and nothing is stored", async () => {
  const clientTapId = randomClientTapId();
  const answer = await postAsStation("/api/v1/taps", {
    taps: [{ client_tap_id: clientTapId, uid: randomUid() }],
  });
  assert.deepEqual(answer, {
    station_id: station.id,
    results: [{ client_tap_id: clientTapId, status: "unknown_token" }],
  });

  assert.deepEqual(await storedTaps(clientTapId), []);
});

test("a heartbeat changes the station's last_seen_at", async () => {
  // A tap's hand-off sets last_seen_at too, so this may already have a time.
  const seenBefore = await stationHealth();
  const sent = { firmware_version: "smoke-test", buffered_taps: 3, reader_ok: true };

  const answer = (await postAsStation("/api/v1/stations/heartbeat", sent)) as {
    station_id: string;
    server_time: string;
  };
  assert.equal(answer.station_id, station.id);
  assert.ok(!Number.isNaN(Date.parse(answer.server_time)), answer.server_time);

  // The Worker answers first and hands the heartbeat on afterwards, so wait for it.
  const deadline = Date.now() + HEARTBEAT_TIMEOUT_MS;
  let seenAfter = await stationHealth();
  while (seenAfter.lastSeenAt === seenBefore.lastSeenAt && Date.now() < deadline) {
    await sleep(200);
    seenAfter = await stationHealth();
  }
  assert.notEqual(seenAfter.lastSeenAt, seenBefore.lastSeenAt, "last_seen_at didn't change");
  assert.deepEqual(
    {
      firmware_version: seenAfter.firmwareVersion,
      buffered_taps: seenAfter.bufferedTaps,
      reader_ok: seenAfter.readerOk,
    },
    sent,
  );
});

/**
 * POSTs `body` to the Worker at `path` with the station's key, and gives back
 * the answer. Anything but a 200 fails the test, with the body as the reason.
 */
async function postAsStation(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${station.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text);
}

/** The station's taps stored under `clientTapId`. */
function storedTaps(clientTapId: string) {
  return db
    .select({ userId: taps.userId, status: taps.status, tappedAt: taps.tappedAt })
    .from(taps)
    .where(and(eq(taps.stationId, station.id), eq(taps.clientTapId, clientTapId)));
}

/** What the station's row says of when it was last seen, and its last heartbeat. */
async function stationHealth() {
  const [row] = await db
    .select({
      lastSeenAt: stations.lastSeenAt,
      firmwareVersion: stations.firmwareVersion,
      bufferedTaps: stations.bufferedTaps,
      readerOk: stations.readerOk,
    })
    .from(stations)
    .where(eq(stations.id, station.id));
  assert.ok(row, `station ${station.id} isn't in geekykey_test`);
  return row;
}

/**
 * Starts a service in its own process group, so stop() also ends what it
 * starts in turn, such as wrangler's workerd. Each line it prints is marked
 * with `name`.
 */
function start(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcess {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) if (line.trim()) console.log(`[${name}] ${line}`);
    });
  }
  return child;
}

function stop(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // It ended on its own in the meantime.
  }
}

/** Waits until `url`'s /api/health answers 200, and fails if the service stops first or takes too long. */
async function waitForHealth(name: string, url: string, child: ChildProcess) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} stopped with exit code ${child.exitCode} before it answered`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  throw new Error(`${name} didn't answer ${url}/api/health within ${START_TIMEOUT_MS / 1000} s`);
}
