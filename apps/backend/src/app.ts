import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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

  const app = new Hono();

  // Hono's default is a plain-text body; the agreement puts every error in the JSON envelope.
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Hono raises a 400 HTTPException when a body will not parse as JSON. That is
    // the client's fault, so it must not surface as 5xx: the firmware contract
    // retries on 5xx, and a station that truncated its buffer would resend the
    // same unparseable payload forever. Re-shaped rather than passed through,
    // because HTTPException's own response body is plain text.
    if (err instanceof HTTPException && err.status === 400) {
      return c.json({
        error: "validation_failed",
        issues: [{ path: [], message: err.message }],
      }, 400);
    }
    console.error(`${c.req.method} ${c.req.path} failed:`, err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/", (c) => c.text("App is running"));

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      service: "geekykey-backend",
      timestamp: new Date().toISOString(),
    }));

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
