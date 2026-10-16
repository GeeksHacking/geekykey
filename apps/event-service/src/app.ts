import { createBaseApp } from "./base-app.ts";
import { claimsStandInRoutes } from "./claims-stand-in/routes.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/pool.ts";
import { authRoutes } from "./event/auth-routes.ts";
import { handoffRoutes } from "./event/handoff-routes.ts";
import { meRoutes } from "./event/me-routes.ts";
import type { SessionOptions } from "./event/session-auth.ts";
import { StandInClaims } from "./geekykey/claims.ts";
import { EventService } from "./geekykey/event-service.ts";
import type { Send } from "./geekykey/service-request.ts";
import { heartbeatRoutes, tapsRoutes } from "./geekykey/station-routes.ts";
import { StationsCopy } from "./geekykey/stations-copy.ts";

export type AppEnv = {
  Variables: { config: Config; db: Db };
};

/** Where the claims stand-in's routes start, in this server. */
const CLAIMS_STAND_IN_PATH = "/claims-stand-in/v1";

export interface AppOptions {
  /**
   * How the GeekyKey side's requests reach the claims stand-in: through
   * app.request(), to this server's own routes, unless a test fakes them.
   */
  sendToClaimsStandIn?: Send;
  /**
   * How the GeekyKey side's requests reach the Event side, for its
   * registered stations and the two hand-offs: through app.request(), to this
   * server's own routes, unless a test fakes them.
   */
  sendToEventService?: Send;
}

/**
 * The GeekyKey backend, with every route mounted, started with its settings
 * and its database. src/server.ts serves it.
 *
 * Its routes come from three areas: the GeekyKey side (src/geekykey/), the
 * Event side (src/event/) and the claims stand-in (src/claims-stand-in/).
 * Until they run as two services, they share this one server, its settings
 * and its database pool.
 *
 * The settings are read once, before this runs, so that which routes exist
 * can depend on them: POST /auth/dev-login is only there when
 * DEV_AUTH_ENABLED is true.
 */
export function createApp(config: Config, db: Db, options: AppOptions = {}) {
  // Built once and shared, so every route that reads or writes a session agrees on it.
  const session: SessionOptions = {
    secret: config.sessionSecret,
    secure: config.sessionCookieSecure,
    organizers: new Set(config.organizers),
  };

  const app = createBaseApp<AppEnv>();

  // Every request shares the one pool. Registered after `/` and `/api/health`,
  // so those answer without the database.
  app.use(async (c, next) => {
    c.set("config", config);
    c.set("db", db);
    await next();
  });

  // The Event side: logging in and out, and what a signed-in user sees.
  app.route("/auth", authRoutes({ session, devAuthEnabled: config.devAuthEnabled }));
  app.route("/api/v1/me", meRoutes({ session }));
  // What the GeekyKey side hands the Event side, with the Event Service key.
  app.route("/geekykey/v1", handoffRoutes({ key: config.eventServiceKey }));

  // The GeekyKey side: what stations call. It reaches the claims stand-in
  // and the Event side only through their routes, in the same process, with
  // the same paths, bodies and keys it will send over HTTPS after the split,
  // so the key checks run on production before then. app.request() takes the
  // Event Service's whole address, and answers it from this server's routes.
  const sendHere: Send = async (url, init) => app.request(url, init);
  const claims = new StandInClaims({
    url: CLAIMS_STAND_IN_PATH,
    key: config.claimsStandInKey,
    send: options.sendToClaimsStandIn ?? sendHere,
  });
  const eventServices = config.eventServices.map(
    ({ id, url }) =>
      new EventService({
        id,
        url,
        key: config.eventServiceKey,
        send: options.sendToEventService ?? sendHere,
      }),
  );
  // Starts empty, and lives as long as the server.
  const stationsCopy = new StationsCopy({
    eventServices,
    now: Date.now,
    fetchTimeoutMs: config.tapDeadlineMs,
  });
  app.route("/api/v1/taps", tapsRoutes({ claims, stationsCopy }));
  app.route("/api/v1/stations/heartbeat", heartbeatRoutes({ stationsCopy }));

  // The claims stand-in: who owns each token, for the GeekyKey side only.
  app.route(CLAIMS_STAND_IN_PATH, claimsStandInRoutes({ key: config.claimsStandInKey }));

  return app;
}
