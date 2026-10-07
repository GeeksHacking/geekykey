import { createBaseApp } from "./base-app.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/pool.ts";
import type { SessionOptions } from "./middleware/session-auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { meRoutes } from "./routes/me.ts";
import { tapsRoutes } from "./routes/taps.ts";

export type AppEnv = {
  Variables: { config: Config; db: Db };
};

/**
 * The GeekyKey backend, with every route mounted, started with its settings
 * and its database. src/server.ts serves it.
 *
 * The settings are read once, before this runs, so that which routes exist
 * can depend on them: POST /auth/dev-login is only there when
 * DEV_AUTH_ENABLED is true.
 */
export function createApp(config: Config, db: Db) {
  // Built once and shared, so every route that reads or writes a session agrees on it.
  const session: SessionOptions = {
    secret: config.sessionSecret,
    secure: config.sessionCookieSecure,
  };

  const app = createBaseApp<AppEnv>();

  // Every request shares the one pool. Registered after `/` and `/api/health`,
  // so those answer without the database.
  app.use(async (c, next) => {
    c.set("config", config);
    c.set("db", db);
    await next();
  });

  app.route("/auth", authRoutes({ session, devAuthEnabled: config.devAuthEnabled }));
  app.route("/api/v1/me", meRoutes({ session }));
  app.route("/api/v1/taps", tapsRoutes());

  return app;
}
