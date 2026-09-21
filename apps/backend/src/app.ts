import { Hono } from "hono";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
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

  const app = new Hono();

  app.onError((err, c) => {
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
    "/api/v1/taps",
    tapsRoutes({ db, pipeline, maxTapsPerRequest: config.maxTapsPerRequest }),
  );

  return app;
}
