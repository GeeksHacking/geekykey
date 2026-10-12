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

test("a DATABASE_URL that won't parse stops the server without logging its password", async () => {
  const started = startServer({ ...SETTINGS, DATABASE_URL: "mysql://app:hunter2-not-real@[bad" });
  const line = await fatalError(started);
  assert.match(String(line.reason), /DATABASE_URL must be/);
  assert.doesNotMatch(started.output(), /hunter2-not-real/);
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
