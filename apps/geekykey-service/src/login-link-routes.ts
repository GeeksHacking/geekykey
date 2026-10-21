import { type LoginLinks, loginLinks } from "@geekykey/login-link";
import { Hono } from "hono";
import { z } from "zod";
import type { EventServiceEntry } from "./config.ts";
import { jsonBody } from "./lib/validate.ts";
import { requireSession, type SessionEnv, type SessionOptions } from "./session.ts";

/** What the event buttons send: which event's screens the link is for. */
const linkRequestSchema = z.object({
  event_id: z.string().min(1),
});

export interface LoginLinkRouteDeps {
  session: Pick<SessionOptions, "secret">;
  /** From config.eventServices. Only those with a public address get links, as only they are in /me's `events`. */
  eventServices: readonly Pick<EventServiceEntry, "id" | "publicUrl" | "key">[];
}

/**
 * Mounted at /api/v1/login-links (the API agreement's 8.6): a login link to
 * one event's screens, for the user behind gk_session, which the event
 * buttons on the token page and My tokens open. The link names only the
 * session's user ID and the name it holds, never anything from the request.
 *
 * It travels in the address's fragment, `#login=`, which a browser never
 * sends to a server, so it reaches no request log. Nothing here logs it.
 */
export function loginLinkRoutes({ session, eventServices }: LoginLinkRouteDeps) {
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
      const event = linksTo.get(c.req.valid("json").event_id);
      if (!event) return c.json({ error: "not_found" }, 404);

      const { link, expiresAt } = await event.links.make({
        userId: c.var.userId,
        name: c.var.loginName,
      });
      // publicUrl has no `/` at the end (src/config.ts).
      return c.json(
        { url: `${event.publicUrl}/#login=${link}`, expires_at: expiresAt.toISOString() },
        201,
      );
    },
  );
}
