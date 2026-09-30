import { createBaseApp } from "./base-app.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import type { SessionOptions } from "./middleware/session-auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { meRoutes } from "./routes/me.ts";
import { tapsRoutes } from "./routes/taps.ts";
import { LocalTokenResolver } from "./services/identity.ts";
import { TapPipeline } from "./services/taps.ts";

export interface AppDeps {
  db: Db;
  config: Config;
}

export function createApp({ db, config }: AppDeps) {
  const pipeline = new TapPipeline(db, new LocalTokenResolver(db), {
    cooldownSeconds: config.tapCooldownSeconds,
  });

  // Built once and shared, so every route that reads or writes a session agrees on it.
  const session: SessionOptions = {
    db,
    secret: config.sessionSecret,
    secure: config.sessionCookieSecure,
  };

  const app = createBaseApp();

  app.route(
    "/auth",
    authRoutes({ db, session, devAuthEnabled: config.devAuthEnabled }),
  );

  app.route("/api/v1/me", meRoutes({ db, session }));

  app.route(
    "/api/v1/taps",
    tapsRoutes({ db, pipeline, maxTapsPerRequest: config.maxTapsPerRequest }),
  );

  return app;
}
