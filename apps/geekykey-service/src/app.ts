import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StandInClaims } from "./claims.ts";
import type { Config } from "./config.ts";
import { EventService } from "./event-service.ts";
import { log, errorFields } from "./lib/log.ts";
import { noStore } from "./lib/no-store.ts";
import type { Send } from "./service-request.ts";
import { heartbeatRoutes, tapsRoutes } from "./station-routes.ts";
import { StationsCopy } from "./stations-copy.ts";

/**
 * The GeekyKey Service, with every route mounted, started with its settings.
 * src/worker.ts serves it.
 *
 * It keeps no database. It reaches each Event Service, for its registered
 * stations and the two hand-offs, and the claims stand-in only through
 * `send`: `fetch`, unless a test fakes them. Every address it sends to
 * starts with `https://`, or is this machine in local development
 * (src/config.ts), and askService never follows a redirect.
 */
export function createApp(config: Config, { send }: { send: Send }) {
  const app = new Hono();

  app.use("/api/*", noStore);
  app.use("/auth/*", noStore);

  // Hono's default is a plain-text body; the agreement puts every error in the JSON envelope.
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Hono raises a 400 HTTPException when a body will not parse as JSON. That is
    // the client's fault, so it must not surface as 5xx: the firmware contract
    // retries on 5xx, and a station that truncated its buffer would resend the
    // same unparseable payload forever. Re-shaped rather than passed through,
    // because HTTPException's own response body is plain text.
    if (err instanceof HTTPException && err.status === 400) {
      return c.json(
        { error: "validation_failed", issues: [{ path: [], message: err.message }] },
        400,
      );
    }
    log("internal_error", { method: c.req.method, path: c.req.path, ...errorFields(err) });
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/", (c) => c.text("App is running"));

  app.get("/api/health", (c) =>
    c.json({ status: "ok", service: "geekykey-service", timestamp: new Date().toISOString() }),
  );

  const claims = new StandInClaims({ ...config.claimsStandIn, send });
  const eventServices = config.eventServices.map(
    ({ id, url, key }) => new EventService({ id, url, key, send }),
  );
  // Starts empty, and lives as long as the Worker's isolate.
  const stationsCopy = new StationsCopy({
    eventServices,
    now: Date.now,
    fetchTimeoutMs: config.tapDeadlineMs,
  });
  const deadlineMs = config.tapDeadlineMs;
  app.route(
    "/api/v1/taps",
    tapsRoutes({ claims, stationsCopy, deadlineMs, maxTaps: config.maxTapsPerRequest }),
  );
  app.route("/api/v1/stations/heartbeat", heartbeatRoutes({ stationsCopy, deadlineMs }));

  return app;
}
