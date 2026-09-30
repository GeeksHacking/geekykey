import { createBaseApp } from "./base-app.ts";
import { type Config, loadConfig } from "./config.ts";
import { createRequestDb, type Db } from "./db/hyperdrive.ts";
import { tapsRoutes } from "./routes/taps.ts";

export type WorkerEnv = {
  Bindings: Env;
  Variables: { config: Config; db: Db };
};

/**
 * The GeekyKey Service as a Cloudflare Worker. So far it answers what
 * base-app.ts sets up and the stations' taps; the other routes move over from
 * today's Deno server one at a time.
 */
export function createWorkerApp() {
  const app = createBaseApp<WorkerEnv>();

  // Each request reads its settings from the Worker's environment and gets
  // its own database connection. Registered after `/` and `/api/health`, so
  // those answer without either.
  app.use(async (c, next) => {
    c.set("config", loadConfig(c.env));
    const requestDb = createRequestDb(c.env.HYPERDRIVE);
    c.set("db", requestDb.db);
    try {
      await next();
    } finally {
      // After the response has gone, so nobody waits on it.
      c.executionCtx.waitUntil(requestDb.close());
    }
  });

  app.route("/api/v1/taps", tapsRoutes());

  return app;
}

export default createWorkerApp();
