import type { LoginLinks } from "@geekykey/login-link";
import { Hono } from "hono";
import { loginNameOf } from "./display-names.ts";
import { requireSession, type SessionEnv, type SessionOptions } from "./session-auth.ts";

/**
 * Mounted at /api/v1/login-links (the API agreement's 8.12, BAC-157): a login
 * link to the GeekyKey screens for the user behind event_session, which the
 * Event screens' My tokens opens. It logs them in there as the same user, so
 * a guest whose sign-in on the GeekyKey screens is gone still sees their own
 * tokens. The link names only the session's user ID, and the name their login
 * gave them, if they still have it, never anything from the request.
 *
 * `links` sign with the key for the GeekyKey screens, never this Event
 * Service's own login link key, so its own POST /auth/login-link refuses
 * them. The GeekyKey Service marks each one used here (11.11), so it works
 * once. Nothing here logs a link.
 */
export function loginLinkRoutes({
  session,
  links,
}: {
  session: SessionOptions;
  links: LoginLinks;
}) {
  return new Hono<SessionEnv>().post("/", requireSession(session), async (c) => {
    const { id } = c.var.user;
    const { link, expiresAt } = await links.make({
      userId: id,
      name: await loginNameOf(c.var.db, id),
    });
    return c.json({ login_link: link, expires_at: expiresAt.toISOString() }, 201);
  });
}
