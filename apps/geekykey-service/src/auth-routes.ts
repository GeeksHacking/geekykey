import {
  type FirebaseIdentity,
  type GoogleSigningKeys,
  verifyFirebaseIdToken,
} from "@geekykey/firebase-login";
import { Hono } from "hono";
import { z } from "zod";
import { errorFields, log } from "./lib/log.ts";
import { jsonBody } from "./lib/validate.ts";
import { clearSession, issueSession, type SessionOptions } from "./session.ts";

/** A user ID is 1 to 128 characters, as a Firebase user ID is. */
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
   * When false, POST /dev-login is never registered. A deployed Worker has no
   * code path to it at all, rather than one that refuses at runtime.
   */
  devAuthEnabled: boolean;
}

/**
 * Mounted at /auth (the API agreement's section 7). These are browser routes
 * rather than JSON resources, which is why they sit outside /api/v1.
 *
 * Every login goes through session.ts's issueSession, so the Firebase login
 * and dev-login set the same cookie.
 */
export function authRoutes({ session, devAuthEnabled, firebase }: AuthRouteDeps) {
  const app = new Hono();

  // The token's name isn't kept yet: the session holds only the user ID until
  // login links need the name (the API agreement's 7.2 and 8.6, BAC-59).
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

    await issueSession(c, identity.userId, session);
    return c.body(null, 204);
  });

  if (devAuthEnabled) {
    // Any user ID: the GeekyKey Service keeps no users, so there's nobody to look up.
    app.post("/dev-login", jsonBody(devLoginSchema), async (c) => {
      await issueSession(c, c.req.valid("json").user_id, session);
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
