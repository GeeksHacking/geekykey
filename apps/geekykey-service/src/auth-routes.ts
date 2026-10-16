import { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "./lib/validate.ts";
import { clearSession, issueSession, type SessionOptions } from "./session.ts";

/** A user ID is 1 to 128 characters, as a Firebase user ID is. */
const devLoginSchema = z.object({
  user_id: z.string().min(1).max(128),
});

export interface AuthRouteDeps {
  session: SessionOptions;
  /**
   * When false, POST /dev-login is never registered. A deployed Worker has no
   * code path to it at all, rather than one that refuses at runtime.
   */
  devAuthEnabled: boolean;
}

/**
 * Mounted at /auth (the API agreement's section 7). These are browser routes
 * rather than JSON resources, which is why they sit outside /api/v1.
 */
export function authRoutes({ session, devAuthEnabled }: AuthRouteDeps) {
  const app = new Hono();

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
