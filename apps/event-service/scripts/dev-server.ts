/**
 * The server with your laptop's settings, for `mise run dev:event-service`,
 * which runs this file with `node --watch`. It restarts when you save a file
 * the server imports.
 *
 * Settings come from three places, each winning over the one before:
 * dev.env, which is committed; your own .env, if you have one; and your
 * shell. Node's --env-file flags could read the two files, but they print a
 * notice when there's no .env, twice under --watch.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const backendDir = join(import.meta.dirname, "..");

/** The settings in one of the backend's env files, or none if it isn't there. */
function envFile(name: string): NodeJS.Dict<string> {
  const path = join(backendDir, name);
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

Object.assign(process.env, { ...envFile("dev.env"), ...envFile(".env"), ...process.env });

// Imported only now, because the server reads its settings as it loads.
await import("../src/server.ts");
