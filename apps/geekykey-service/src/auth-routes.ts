import {
  type FirebaseIdentity,
  type GoogleSigningKeys,
  verifyFirebaseIdToken,
} from "@geekykey/firebase-login";
import type { LoginLink, LoginLinks } from "@geekykey/login-link";
import { Hono } from "hono";
import { z } from "zod";
import { type EventService, EventServiceUnavailable } from "./event-service.ts";
import { errorFields, log } from "./lib/log.ts";
import { userIdSchema } from "./lib/user-id.ts";
import { jsonBody } from "./lib/validate.ts";
import { clearSession, issueSession, type SessionOptions } from "./session.ts";

const devLoginSchema = z.object({ user_id: userIdSchema });

/**
 * Only `application/json` is read: any other content type leaves the body
 * empty, so it fails here, and a form on another site can't log anyone in.
 */
const firebaseLoginSchema = z.object({
  id_token: z.string().min(1),
});

/** Only `application/json`, for the same reason as firebaseLoginSchema. */
const loginLinkSchema = z.object({
  login_link: z.string().min(1),
});

/** An Event Service whose login links log a user in here, and how its links are read. */
export interface LoginLinkSender {
  service: Pick<EventService, "id" | "markLoginLinkUsed">;
  /** Its links to these screens, signed with the key derived from its Event Service key. */
  links: LoginLinks;
}

export interface AuthRouteDeps {
  session: SessionOptions;
  /** The Firebase project, and Google's keys, that POST /firebase checks ID tokens with. */
  firebase: { projectId: string; keys: GoogleSigningKeys };
  /**
   * When false, POST /dev-login is never registered. A deployed Worker has no
   * code path to it at all, rather than one that refuses at runtime.
   */
  devAuthEnabled: boolean;
  /**
   * The Event Services whose login links POST /login-link accepts: those
   * whose entry says `login_links_to_geekykey`. Empty, and every link is
   * refused.
   */
  loginLinkSenders: readonly LoginLinkSender[];
  /** Milliseconds the Event Service gets to mark a link used, as a user's request gives the claims. */
  markUsedDeadlineMs: number;
}

/**
 * Mounted at /auth (the API agreement's section 7). These are browser routes
 * rather than JSON resources, which is why they sit outside /api/v1.
 *
 * Every login goes through session.ts's issueSession, so the Firebase login
 * and dev-login set the same cookie.
 */
export function authRoutes({
  session,
  devAuthEnabled,
  firebase,
  loginLinkSenders,
  markUsedDeadlineMs,
}: AuthRouteDeps) {
  const app = new Hono();

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

    // The session holds the token's name, so a login link can carry it (7.2 and 8.6).
    await issueSession(c, { userId: identity.userId, name: identity.displayName }, session);
    return c.body(null, 204);
  });

  // The way in from an Event Service's screens, the reverse of 8.6 (the API agreement's 7.5,
  // BAC-157), so a guest whose sign-in here is gone still sees their own tokens. This
  // Worker keeps no database, so the Event Service that made the link marks it used, and it
  // works once. The link is never logged: it logs someone in until it's used or expires.
  app.post("/login-link", jsonBody(loginLinkSchema), async (c) => {
    const sent = await readLink(loginLinkSenders, c.req.valid("json").login_link);
    if (sent === null) return c.json({ error: "invalid_login_link" }, 401);
    const { service, link } = sent;

    let firstUse: boolean;
    try {
      firstUse = await service.markLoginLinkUsed(
        { jti: link.jti, expires_at: link.expiresAt.toISOString() },
        AbortSignal.timeout(markUsedDeadlineMs),
      );
    } catch (err) {
      if (!(err instanceof EventServiceUnavailable)) throw err;
      log("login_link_unavailable", {
        event_service: service.id,
        user_id: link.userId,
        reason: err.reason,
        status: err.status,
      });
      return c.json({ error: "event_service_unavailable" }, 503);
    }
    if (!firstUse) return c.json({ error: "invalid_login_link" }, 401);

    // Over any session already there: the link's user wins, as on the Event Service (7.4).
    await issueSession(c, { userId: link.userId, name: link.name }, session);
    return c.body(null, 204);
  });

  if (devAuthEnabled) {
    // Any user ID: the GeekyKey Service keeps no users, so there's nobody to look up.
    app.post("/dev-login", jsonBody(devLoginSchema), async (c) => {
      await issueSession(c, { userId: c.req.valid("json").user_id, name: null }, session);
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

/**
 * The Event Service that made `text`, and what the link says, or null when
 * none of `senders` made it, or it doesn't check out (expired, changed, or
 * made for the event's screens). Checked here first, so a link that can't
 * log anyone in asks no Event Service.
 */
async function readLink(
  senders: readonly LoginLinkSender[],
  text: string,
): Promise<{ service: LoginLinkSender["service"]; link: LoginLink } | null> {
  for (const { service, links } of senders) {
    const link = await links.read(text);
    if (link !== null) return { service, link };
  }
  return null;
}
