/**
 * The GeekyKey backend as a Node server. `pnpm dev` runs this file through
 * scripts/dev-server.ts, and the image runs it bundled into one file
 * (dist/server.cjs).
 *
 * It reads its settings from environment variables once, here, and a bad or
 * missing one, such as SESSION_SECRET or DATABASE_URL, stops it starting. On
 * Cloud Run its secrets come in one setting, APP_SECRETS, unpacked first.
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig, unpackAppSecrets } from "./config.ts";
import { createDbPool } from "./db/pool.ts";
import { errorFields, log } from "./lib/log.ts";

// Anything thrown and never caught, as the server starts or later, stops it
// with one log line rather than Node's own report, which prints the error's
// every property: a DATABASE_URL that won't parse would print its password.
// A rejected promise nobody handles ends up here too.
process.on("uncaughtException", (err) => {
  log("fatal_error", err instanceof ConfigError ? { reason: err.message } : errorFields(err));
  process.exit(1);
});

const config = loadConfig(unpackAppSecrets(process.env));
const database = createDbPool(config.databaseUrl);
const app = createApp(config, database.db);

// Every network interface, not only localhost: real stations call a laptop by
// name, such as http://A-Mac.local:8000, and Cloud Run calls the container
// from outside it.
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log("server_started", { port: info.port });
});

// Cloud Run sends SIGTERM 10 seconds before it stops an instance. The server
// stops taking requests and lets the ones in flight finish, then the pool
// closes its connections, so TiDB ends their sessions cleanly. Ctrl-C sends
// SIGINT, which Node ignores inside a container unless it's handled.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log("server_stopping", { signal });
    server.close(() => void database.close());
  });
}
