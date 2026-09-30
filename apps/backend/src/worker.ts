import { env } from "cloudflare:workers";
import { createBaseApp } from "./base-app.ts";
import { type Config, loadConfig } from "./config.ts";
import { createRequestDb, type Db } from "./db/hyperdrive.ts";
import type { SessionOptions } from "./middleware/session-auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { meRoutes } from "./routes/me.ts";
import { tapsRoutes } from "./routes/taps.ts";

export type WorkerEnv = {
  Bindings: Env;
  Variables: { config: Config; db: Db };
};

/**
 * The GeekyKey Service as a Cloudflare Worker, started with `settings`: the
 * Worker's environment, which gets them from wrangler.jsonc, .dev.vars or
 * `wrangler secret put`.
 *
 * The settings are read once, when it starts, so that which routes exist can
 * depend on them: POST /auth/dev-login is only there when DEV_AUTH_ENABLED
 * is true. A bad setting, such as a missing SESSION_SECRET, stops it starting
 * rather than failing every request.
 */
export function createWorkerApp(settings: object) {
  const config = loadConfig(settings);
  // Built once and shared, so every route that reads or writes a session agrees on it.
  const session: SessionOptions = {
    secret: config.sessionSecret,
    secure: config.sessionCookieSecure,
  };

  const app = createBaseApp<WorkerEnv>();

  // Each request gets its own database connection. Registered after `/` and
  // `/api/health`, so those answer without one.
  app.use(async (c, next) => {
    c.set("config", config);
    const requestDb = createRequestDb(c.env.HYPERDRIVE);
    c.set("db", requestDb.db);
    try {
      await next();
    } finally {
      // After the response has gone, so nobody waits on it.
      c.executionCtx.waitUntil(requestDb.close());
    }
  });

  app.route("/auth", authRoutes({ session, devAuthEnabled: config.devAuthEnabled }));
  app.route("/api/v1/me", meRoutes({ session }));
  app.route("/api/v1/taps", tapsRoutes());

  return app;
}

export default createWorkerApp(env);
