import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { users } from "../db/schema.ts";
import { jsonBody } from "../lib/validate.ts";
import { clearSession, issueSession, type SessionOptions } from "../middleware/session-auth.ts";
import type { WorkerEnv } from "../worker.ts";

const devLoginSchema = z.object({
  user_id: z.string().min(1).max(128),
});

export interface AuthRouteDeps {
  session: SessionOptions;
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
 * Both of them go through session-auth.ts, so when the portal callback lands it
 * joins them without a second definition of what a session looks like.
 */
export function authRoutes({ session, devAuthEnabled }: AuthRouteDeps) {
  const app = new Hono<WorkerEnv>();

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
