import { type GoogleSigningKeys, googleSigningKeys } from "@geekykey/firebase-login";
import { loginLinks } from "@geekykey/login-link";
import { createBaseApp } from "./base-app.ts";
import { claimsStandInRoutes } from "./claims-stand-in/routes.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/pool.ts";
import { adminRoutes } from "./event/admin-routes.ts";
import { authRoutes } from "./event/auth-routes.ts";
import { handoffRoutes } from "./event/handoff-routes.ts";
import { meRoutes } from "./event/me-routes.ts";
import type { SessionOptions } from "./event/session-auth.ts";
import { showcaseGames } from "./showcase/games.ts";

export type AppEnv = {
  Variables: { config: Config; db: Db };
};

/** What the Event Service reaches outside itself, other than its database. */
export interface AppDeps {
  /** Google's keys, which POST /auth/firebase checks ID tokens against. Tests fake them. */
  googleKeys: GoogleSigningKeys;
  /** The clock the station board tells online stations by. Tests pin it. */
  now?: () => Date;
}

/**
 * The Event Service, with every route mounted, started with its settings and
 * its database. src/server.ts serves it.
 *
 * Its routes come from two areas: the Event side (src/event/) and the claims
 * stand-in (src/claims-stand-in/). Until the stand-in goes at the switch to
 * the Portal, they share this one server, its settings and its database pool.
 * Stations call the GeekyKey Service, apps/geekykey-service, which reaches
 * both through their routes.
 *
 * The Event side's base takes the games this event runs from here, as its
 * settings name them (src/showcase/), since it imports no game itself.
 *
 * The settings are read once, before this runs, so that which routes exist
 * can depend on them: POST /auth/dev-login is only there when
 * DEV_AUTH_ENABLED is true.
 */
export function createApp(
  config: Config,
  db: Db,
  // One set of keys for the server's life, so Google's keys are cached between logins.
  { googleKeys, now }: AppDeps = { googleKeys: googleSigningKeys() },
) {
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
  app.route(
    "/auth",
    authRoutes({
      session,
      devAuthEnabled: config.devAuthEnabled,
      firebase: { projectId: config.firebaseProjectId, keys: googleKeys },
      // Signed with a key derived from the Event Service key (the API agreement's 11.9).
      loginLinks: loginLinks(config.eventServiceKey),
    }),
  );
  app.route("/api/v1/me", meRoutes({ session }));
  app.route("/api/v1/admin", adminRoutes({ session, games: showcaseGames, now }));
  // What the GeekyKey Service hands the Event side, with the Event Service key.
  app.route("/geekykey/v1", handoffRoutes({ key: config.eventServiceKey, games: showcaseGames }));

  // The claims stand-in: who owns each token, for the GeekyKey Service only.
  app.route("/claims-stand-in/v1", claimsStandInRoutes({ key: config.claimsStandInKey }));

  return app;
}
