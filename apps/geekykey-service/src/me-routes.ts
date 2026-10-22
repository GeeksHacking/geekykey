import { Hono } from "hono";
import type { Claims } from "./claims.ts";
import { withClaimsDeadline } from "./claims-deadline.ts";
import type { EventServiceEntry } from "./config.ts";
import { requireSession, type SessionEnv, type SessionOptions } from "./session.ts";

export interface MeRouteDeps {
  session: Pick<SessionOptions, "secret">;
  claims: Claims;
  /** From config.geekykeyAdmins, checked on every request. */
  geekykeyAdmins: ReadonlySet<string>;
  /** From config.eventServices. Only those with a public address are listed. */
  eventServices: readonly Pick<EventServiceEntry, "id" | "name" | "publicUrl">[];
  /** Milliseconds the claims stand-in has to answer (section 8's opening). */
  deadlineMs: number;
}

/**
 * Mounted at /api/v1/me (the API agreement's 8.4): everything My tokens
 * needs, and the GeekyKey screens' "Am I logged in?". `401 unauthenticated`
 * without a session. When the claims stand-in doesn't answer properly within
 * the deadline, `503 claims_unavailable`, and the screens say "Couldn't
 * reach GeeksHacking. Try again."
 */
export function meRoutes({
  session,
  claims,
  geekykeyAdmins,
  eventServices,
  deadlineMs,
}: MeRouteDeps) {
  // The same for everyone, so worked out once.
  const events = eventServices.flatMap(({ id, name, publicUrl }) =>
    publicUrl === null ? [] : [{ id, name, url: publicUrl }],
  );

  return new Hono<SessionEnv>().get(
    "/",
    requireSession(session),
    async (c) =>
      await withClaimsDeadline(c, deadlineMs, async (signal) => {
        const { userId } = c.var;
        const tokens = await claims.tokensOf(userId, signal);
        return c.json({
          user: { id: userId, is_geekykey_admin: geekykeyAdmins.has(userId) },
          tokens: tokens.map(({ uid, claimedAt }) => ({ uid, claimed_at: claimedAt })),
          events,
        });
      }),
  );
}
