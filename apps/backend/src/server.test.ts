import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { onTestFinished, test } from "vitest";
import { localDatabaseUrl } from "../scripts/local-tidb.ts";

const backendDir = join(import.meta.dirname, "..");

/** What the server needs to start, as Cloud Run gives it, on any free port. */
const SETTINGS = {
  DATABASE_URL: localDatabaseUrl("geekykey_test"),
  SESSION_SECRET: "test-secret-at-least-16",
  CLAIMS_STAND_IN_KEY: "c".repeat(64),
  PORT: "0",
};

function settingsWithout(name: keyof typeof SETTINGS): Record<string, string> {
  const settings: Record<string, string> = { ...SETTINGS };
  delete settings[name];
  return settings;
}

/** One line the server logs. */
type LogLine = { severity: string; message: string } & Record<string, unknown>;

/** Every line in `output`, each read as one JSON object. Throws on a line that isn't. */
function logLines(output: string): LogLine[] {
  return output
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as LogLine);
}

/**
 * Starts `node src/server.ts` with only these environment variables, as
 * `pnpm dev` and the image do, and keeps everything it prints.
 */
function startServer(env: Record<string, string>) {
  const server = spawn(process.execPath, ["src/server.ts"], { cwd: backendDir, env });
  onTestFinished(() => {
    if (server.exitCode === null) server.kill("SIGKILL");
  });

  let output = "";
  const listening = new Promise<string>((resolve) => {
    server.stdout.on("data", (chunk: Buffer) => {
      output += chunk;
      // Only whole lines, since a chunk can end partway through one.
      const started = logLines(output.slice(0, output.lastIndexOf("\n") + 1)).find(
        (line) => line.message === "server_started",
      );
      if (started) resolve(`http://localhost:${started.port}`);
    });
  });
  server.stderr.on("data", (chunk: Buffer) => (output += chunk));
  const exited = once(server, "exit").then(([code]) => code as number | null);

  return { server, listening, exited, output: () => output };
}

test("the server answers /api/health on the port it's given", async () => {
  const { listening } = startServer(SETTINGS);
  const res = await fetch(`${await listening}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { status: string }).status, "ok");
});

/** The one line a server that stopped on an error logged. */
async function fatalError({ exited, output }: ReturnType<typeof startServer>) {
  assert.notEqual(await exited, 0);
  const lines = logLines(output());
  assert.equal(lines.length, 1, output());
  assert.equal(lines[0]!.severity, "ERROR");
  assert.equal(lines[0]!.message, "fatal_error");
  return lines[0]!;
}

test("the server won't start without SESSION_SECRET", async () => {
  const line = await fatalError(startServer(settingsWithout("SESSION_SECRET")));
  assert.match(String(line.reason), /SESSION_SECRET is required/);
});

test("the server won't start without DATABASE_URL", async () => {
  const line = await fatalError(startServer(settingsWithout("DATABASE_URL")));
  assert.match(String(line.reason), /DATABASE_URL is required/);
});

test("the server won't start without CLAIMS_STAND_IN_KEY", async () => {
  const line = await fatalError(startServer(settingsWithout("CLAIMS_STAND_IN_KEY")));
  assert.match(String(line.reason), /CLAIMS_STAND_IN_KEY is required/);
});

test("a CLAIMS_STAND_IN_KEY that isn't 64 hex characters stops the server without logging it", async () => {
  // The base64url a station key is written in, which the key isn't.
  const key = "kQ3v-Not_A_Hex_Key_but-long-enough-to-pass-for-one-0123456789abcd";
  const started = startServer({ ...SETTINGS, CLAIMS_STAND_IN_KEY: key });
  const line = await fatalError(started);
  assert.match(String(line.reason), /CLAIMS_STAND_IN_KEY must be 64 lower-case hex characters/);
  assert.doesNotMatch(started.output(), /kQ3v/);
});

test("a DATABASE_URL that won't parse stops the server without logging its password", async () => {
  const started = startServer({ ...SETTINGS, DATABASE_URL: "mysql://app:hunter2-not-real@[bad" });
  const line = await fatalError(started);
  assert.match(String(line.reason), /DATABASE_URL must be/);
  assert.doesNotMatch(started.output(), /hunter2-not-real/);
});

/** SETTINGS as Cloud Run gives them: the secrets in one APP_SECRETS, and PORT on its own. */
function bundled(secrets: Record<string, unknown>): Record<string, string> {
  return { PORT: SETTINGS.PORT, APP_SECRETS: JSON.stringify(secrets) };
}

test("the server starts with its secrets in APP_SECRETS", async () => {
  const { DATABASE_URL, SESSION_SECRET } = SETTINGS;
  const { listening } = startServer(bundled({ DATABASE_URL, SESSION_SECRET }));
  const res = await fetch(`${await listening}/api/health`);
  assert.equal(res.status, 200);
});

test("an APP_SECRETS that isn't JSON stops the server without logging it", async () => {
  const started = startServer({ PORT: "0", APP_SECRETS: '{"SESSION_SECRET": "hunter2-not-real' });
  const line = await fatalError(started);
  assert.match(String(line.reason), /APP_SECRETS must be a JSON object/);
  assert.doesNotMatch(started.output(), /hunter2-not-real/);
});

test("an APP_SECRETS value that isn't a string stops the server without logging it", async () => {
  const started = startServer(bundled({ ...SETTINGS, SESSION_SECRET: ["hunter2-not-real"] }));
  const line = await fatalError(started);
  assert.match(String(line.reason), /SESSION_SECRET in APP_SECRETS must be a string/);
  assert.doesNotMatch(started.output(), /hunter2-not-real/);
});

test("APP_SECRETS can't hold an ordinary setting, such as DEV_AUTH_ENABLED", async () => {
  const { DATABASE_URL, SESSION_SECRET } = SETTINGS;
  const started = startServer(bundled({ DATABASE_URL, SESSION_SECRET, DEV_AUTH_ENABLED: "true" }));
  const line = await fatalError(started);
  assert.match(String(line.reason), /DEV_AUTH_ENABLED can't be in APP_SECRETS/);
});

test("a secret both in APP_SECRETS and on its own stops the server", async () => {
  const { DATABASE_URL, SESSION_SECRET } = SETTINGS;
  const started = startServer({ ...bundled({ DATABASE_URL, SESSION_SECRET }), SESSION_SECRET });
  const line = await fatalError(started);
  assert.match(String(line.reason), /SESSION_SECRET is set both in APP_SECRETS and on its own/);
});

test("on SIGTERM, the server closes its database connections and exits", async () => {
  const { server, listening, exited } = startServer(SETTINGS);
  // A station key check, so the server opens a connection to the database.
  const res = await fetch(`${await listening}/api/v1/taps`, {
    method: "POST",
    headers: { Authorization: "Bearer gk_sta_not-a-real-key" },
  });
  assert.equal(res.status, 401);

  // An open connection would keep it running.
  server.kill("SIGTERM");
  assert.equal(await exited, 0);
});

test("every line the server logs is one JSON object with a fixed name", async () => {
  const { server, listening, exited, output } = startServer(SETTINGS);
  await listening;
  server.kill("SIGTERM");
  assert.equal(await exited, 0);

  const lines = logLines(output());
  assert.deepEqual(
    lines.map(({ severity, message }) => ({ severity, message })),
    [
      { severity: "INFO", message: "server_started" },
      { severity: "INFO", message: "server_stopping" },
    ],
  );
  assert.equal(lines[1]!.signal, "SIGTERM");
});
