import { type LoginLinks, loginLinks } from "@geekykey/login-link";
import { Hono } from "hono";
import { z } from "zod";
import type { Claims } from "./claims.ts";
import { withClaimsDeadline } from "./claims-deadline.ts";
import type { EventServiceEntry } from "./config.ts";
import { tokenUid } from "./lib/token-uid.ts";
import { jsonBody } from "./lib/validate.ts";
import { requireSession, type SessionCheck, type SessionEnv } from "./session.ts";

/**
 * What the event buttons send: which event's screens the link is for, and on
 * the token page, the token's UID, in any separator style.
 */
const linkRequestSchema = z.object({
  event_id: z.string().min(1),
  uid: tokenUid.optional(),
});

export interface LoginLinkRouteDeps {
  session: SessionCheck;
  /** From config.eventServices. Only those with a public address get links, as only they are in /me's `events`. */
  eventServices: readonly Pick<EventServiceEntry, "id" | "publicUrl" | "key">[];
  /** Where the token's kind comes from, when the request names a token. */
  claims: Claims;
  /** Milliseconds the claims get, as on the token routes (section 8's opening). */
  deadlineMs: number;
}

/**
 * Mounted at /api/v1/login-links (the API agreement's 8.6): a login link to
 * one event's screens, for the user behind gk_session, which the event
 * buttons on the token page and My tokens open. The link names only the
 * session's user ID and the name it holds, never anything from the request.
 *
 * From a token's page, the request names the token, and the link carries its
 * kind from the list beside the claims stand-in (ADR 0006), but only while
 * the session's user owns it, so nobody takes on a kind by naming someone
 * else's token. Otherwise, and from My tokens, the link has no kind. Only
 * then are the claims asked, within 4 seconds, and when they don't answer,
 * the request answers `503 claims_unavailable`.
 *
 * It travels in the address's fragment, `#login=`, which a browser never
 * sends to a server, so it reaches no request log. Nothing here logs it.
 */
export function loginLinkRoutes({
  session,
  eventServices,
  claims,
  deadlineMs,
}: LoginLinkRouteDeps) {
  // Each Event Service's links, signed with the key derived from its own Event Service key.
  const linksTo = new Map<string, { publicUrl: string; links: LoginLinks }>(
    eventServices.flatMap(({ id, publicUrl, key }) =>
      publicUrl === null ? [] : [[id, { publicUrl, links: loginLinks(key) }] as const],
    ),
  );

  return new Hono<SessionEnv>().post(
    "/",
    requireSession(session),
    jsonBody(linkRequestSchema),
    async (c) => {
      const { event_id, uid } = c.req.valid("json");
      const event = linksTo.get(event_id);
      if (!event) return c.json({ error: "not_found" }, 404);
      const { userId, loginName } = c.var;

      const answer = async (kind: string | null) => {
        const { link, expiresAt } = await event.links.make({ userId, name: loginName, kind });
        // publicUrl has no `/` at the end (src/config.ts).
        return c.json(
          { url: `${event.publicUrl}/#login=${link}`, expires_at: expiresAt.toISOString() },
          201,
        );
      };
      if (uid === undefined) return await answer(null);
      return await withClaimsDeadline(c, deadlineMs, async (signal) => {
        const owner = (await claims.ownersOf([uid], signal)).get(uid);
        return await answer(owner?.userId === userId ? owner.kind : null);
      });
    },
  );
}
