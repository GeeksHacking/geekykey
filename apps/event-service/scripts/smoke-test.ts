/**
 * The end-to-end smoke test (the migration spec's checkpoint 4, "CI"). It
 * starts the Event Service on Node and the GeekyKey Service in `wrangler dev`,
 * adds a registered station and a claimed token to geekykey_test, and sends a
 * station's requests through the Worker. It also connects two people: one meets
 * the other's token through the Worker, and the other accepts on the Event
 * Service. Each check reads the database itself, not only the answer, since a
 * tap can be answered `accepted` by one side and lost by the other.
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
import { and, eq, isNotNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import { loginLinks } from "@geekykey/login-link";
import { tokenKinds } from "../src/claims-stand-in/schema.ts";
import { setConnectAcross, setShowcase } from "../src/event/event-settings.ts";
import { stations, taps } from "../src/event/schema.ts";
import { connections, meetingHalves } from "../src/games/connections/schema.ts";
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
      FIREBASE_PROJECT_ID: "geekykey-b035a",
    },
  });

  // `wrangler dev --env-file` reads the Worker's settings from that file and
  // skips .dev.vars. It also reads the shell's variables, which win over the
  // file, so these names are taken out of the environment it inherits.
  const workerSettings = {
    SESSION_SECRET: randomKey(),
    CLAIMS_STAND_IN_KEY: claimsStandInKey,
    EVENT_SERVICE_KEY_SHOWCASE: eventServiceKey,
    // As in wrangler.jsonc: it takes meetings, and its login links log a user in here.
    EVENT_SERVICES: JSON.stringify([
      {
        id: "showcase",
        name: "Capstone Showcase",
        url: eventServiceUrl,
        meetings: true,
        login_links_to_geekykey: true,
      },
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
  // With the passport's lines for the station, through both services (6.1). How many stamp
  // slots there are depends on what else geekykey_test holds, so only their shape is checked.
  const { results, ...rest } = answer as {
    station_id: string;
    results: { lines?: string[]; complete?: boolean }[];
  };
  const [{ lines, complete, ...result } = {}] = results;
  assert.deepEqual(
    { ...rest, results: [result] },
    { station_id: station.id, results: [{ client_tap_id: clientTapId, status: "accepted" }] },
  );
  assert.match(lines?.[0] ?? "", /^Smoke: \d+ of \d+$/);
  assert.equal(lines?.length, 2);
  assert.ok(complete === undefined || complete === true);

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

test("a meeting through the Worker and an accept on the Event Service connect two people", async () => {
  // A new pair each run, with tokens of two kinds, so they may connect under the
  // default rule, and names nobody else in geekykey_test has.
  const run = randomBytes(3).toString("hex");
  const [a, b] = await Promise.all(
    (["A", "B"] as const).map(async (kind) => {
      const person = { id: `smoke-${kind.toLowerCase()}-${run}`, uid: randomUid(), kind };
      await addParticipant(db, { ...person, displayName: `Smoke ${kind} ${run}` });
      await db.insert(tokenKinds).values({ uid: person.uid, kind });
      return { ...person, name: `Smoke ${kind} ${run}`, ...(await logIn(person.id)) };
    }),
  );
  // What a new event has, whatever an earlier test left in geekykey_test.
  await setConnectAcross(db, "token_kinds");
  await setShowcase(db, false);
  for (const person of [a, b]) await setUp(person.eventCookie, person.name);

  // A's phone on B's token (8.8): the Worker asks the claims stand-in and hands the half on.
  const meeting = (await sendJson(`${workerUrl}/api/v1/tokens/${b.uid}/meet`, a.workerCookie)) as {
    meetings: { event_id: string; status: string; owner_name: string | null }[];
  };
  assert.deepEqual(
    meeting.meetings.map(({ event_id, status, owner_name }) => ({ event_id, status, owner_name })),
    [{ event_id: "showcase", status: "waiting", owner_name: b.name }],
  );

  // B sees A's request in /me (8.1) and accepts it (8.10).
  const me = (await sendJson(`${eventServiceUrl}/api/v1/me`, b.eventCookie, {
    method: "GET",
  })) as { connection_requests: { id: string; display_name: string }[] };
  const request = me.connection_requests.find(({ display_name }) => display_name === a.name);
  assert.ok(request, `no request from ${a.name} in ${JSON.stringify(me.connection_requests)}`);
  const accepted = await sendJson(
    `${eventServiceUrl}/api/v1/me/connection-requests/${request.id}/accept`,
    b.eventCookie,
  );
  assert.deepEqual(accepted, { status: "connected" });

  // One connection between the two, with each one's kind, and no request left waiting.
  const pair = or(
    and(eq(connections.userA, a.id), eq(connections.userB, b.id)),
    and(eq(connections.userA, b.id), eq(connections.userB, a.id)),
  );
  const made = await db
    .select({ userA: connections.userA, kindA: connections.kindA, kindB: connections.kindB })
    .from(connections)
    .where(pair);
  // The smaller user ID is user_a, so A's kind is on either side.
  const kinds = made.map(({ userA, kindA, kindB }) =>
    userA === a.id ? [kindA, kindB] : [kindB, kindA],
  );
  assert.deepEqual(kinds, [["A", "B"]]);
  const waiting = await db
    .select({ requestId: meetingHalves.requestId })
    .from(meetingHalves)
    .where(
      and(
        isNotNull(meetingHalves.requestId),
        or(
          and(eq(meetingHalves.userA, a.id), eq(meetingHalves.userB, b.id)),
          and(eq(meetingHalves.userA, b.id), eq(meetingHalves.userB, a.id)),
        ),
      ),
    );
  assert.deepEqual(waiting, []);
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

/**
 * Logs `userId` in on both services the way a phone does, and gives back the
 * two session cookies. The first login link is made here, as the GeekyKey
 * Service makes it (8.6), since the smoke test holds the Event Service key;
 * the Event Service then makes the link back to the GeekyKey Service (8.12),
 * which marks it used there (7.5).
 */
async function logIn(userId: string): Promise<{ eventCookie: string; workerCookie: string }> {
  const { link } = await loginLinks(eventServiceKey).make({ userId, name: null });
  const eventCookie = await sessionCookie(`${eventServiceUrl}/auth/login-link`, {
    login_link: link,
  });
  const { login_link } = (await sendJson(`${eventServiceUrl}/api/v1/login-links`, eventCookie, {
    status: 201,
  })) as { login_link: string };
  const workerCookie = await sessionCookie(`${workerUrl}/auth/login-link`, { login_link });
  return { eventCookie, workerCookie };
}

/** POSTs `body` to a login route at `url`, and gives back the session cookie it sets, as `name=value`. */
async function sessionCookie(url: string, body: unknown): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 204, await response.text());
  const [cookie] = response.headers.getSetCookie();
  assert.ok(cookie, `${url} set no cookie`);
  return cookie.split(";")[0] as string;
}

/** Sets the user's name and answers every question with its first choice (8.7), as participant setup does. */
async function setUp(eventCookie: string, name: string) {
  const { questions } = (await sendJson(`${eventServiceUrl}/api/v1/me`, eventCookie, {
    method: "GET",
  })) as { questions: { id: string; choices: { id: string }[] }[] | null };
  const answers = Object.fromEntries(
    (questions ?? []).map(({ id, choices }) => [id, choices[0]?.id]),
  );
  await sendJson(`${eventServiceUrl}/api/v1/me`, eventCookie, {
    method: "PATCH",
    body: { display_name: name, answers },
  });
}

/**
 * Sends a request with `cookie` to `url`, a POST with no body unless told
 * otherwise, and gives back the answer, or null for none. Any status but the
 * expected one fails the test, with the body as the reason.
 */
async function sendJson(
  url: string,
  cookie: string,
  {
    method = "POST",
    body,
    status = 200,
  }: { method?: string; body?: unknown; status?: number } = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${url}: ${text}`);
  return text === "" ? null : JSON.parse(text);
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
