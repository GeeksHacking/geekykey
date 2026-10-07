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
      const address = /Listening on (http:\/\/\S+)/.exec(output)?.[1];
      if (address) resolve(address);
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

test("the server won't start without SESSION_SECRET", async () => {
  const { exited, output } = startServer(settingsWithout("SESSION_SECRET"));
  assert.notEqual(await exited, 0);
  assert.match(output(), /SESSION_SECRET is required/);
});

test("the server won't start without DATABASE_URL", async () => {
  const { exited, output } = startServer(settingsWithout("DATABASE_URL"));
  assert.notEqual(await exited, 0);
  assert.match(output(), /DATABASE_URL is required/);
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
