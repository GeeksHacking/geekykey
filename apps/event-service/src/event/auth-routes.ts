import {
  type FirebaseIdentity,
  type GoogleSigningKeys,
  verifyFirebaseIdToken,
} from "@geekykey/firebase-login";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { errorFields, log } from "../lib/log.ts";
import { jsonBody } from "../lib/validate.ts";
import { saveLogin } from "./display-names.ts";
import { users } from "./schema.ts";
import { clearSession, issueSession, type SessionOptions } from "./session-auth.ts";

const devLoginSchema = z.object({
  user_id: z.string().min(1).max(128),
});

/**
 * Only `application/json` is read: any other content type leaves the body
 * empty, so it fails here, and a form on another site can't log anyone in.
 */
const firebaseLoginSchema = z.object({
  id_token: z.string().min(1),
});

export interface AuthRouteDeps {
  session: SessionOptions;
  /** The Firebase project, and Google's keys, that POST /firebase checks ID tokens with. */
  firebase: { projectId: string; keys: GoogleSigningKeys };
  /**
   * When false, POST /dev-login is never registered. A production deployment
   * has no code path to it at all, rather than one that refuses at runtime.
   */
  devAuthEnabled: boolean;
}

/**
 * Mounted at /auth. These are browser routes rather than JSON resources, which
 * is why they sit outside /api/v1.
 *
 * Every login goes through session-auth.ts's issueSession, so the Firebase
 * login and dev-login set the same cookie, and the Portal's login joins them
 * after the showcase without a second definition of what a session looks like.
 */
export function authRoutes({ session, devAuthEnabled, firebase }: AuthRouteDeps) {
  const app = new Hono<AppEnv>();

  app.post("/firebase", jsonBody(firebaseLoginSchema), async (c) => {
    const { id_token } = c.req.valid("json");
    let identity: FirebaseIdentity | null;
    try {
      identity = await verifyFirebaseIdToken(id_token, firebase);
    } catch (err) {
      // Google's keys didn't arrive, which says nothing about the token, so it isn't called bad.
      log("login_unavailable", errorFields(err));
      return c.json({ error: "login_unavailable" }, 503);
    }
    if (!identity) return c.json({ error: "invalid_token" }, 401);

    await saveLogin(c.var.db, identity.userId, identity.displayName);
    await issueSession(c, identity.userId, session);
    return c.body(null, 204);
  });

  if (devAuthEnabled) {
    app.post("/dev-login", jsonBody(devLoginSchema), async (c) => {
      const { user_id } = c.req.valid("json");
      const [user] = await c.var.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user_id))
        .limit(1);
      // The seed owns user creation. Signing in as somebody who does not exist is a 404.
      if (!user) return c.json({ error: "not_found" }, 404);

      await issueSession(c, user.id, session);
      return c.body(null, 204);
    });
  }

  // No session gate: signing out when already signed out is a no-op, which keeps it idempotent.
  app.post("/logout", (c) => {
    clearSession(c, session);
    return c.body(null, 204);
  });

  return app;
}
