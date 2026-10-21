import { Hono } from "hono";
import { type Claims, ClaimsUnavailable } from "./claims.ts";
import type { EventServiceEntry } from "./config.ts";
import { log } from "./lib/log.ts";
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

  return new Hono<SessionEnv>().get("/", requireSession(session), async (c) => {
    const { userId } = c.var;
    let tokens: Awaited<ReturnType<Claims["tokensOf"]>>;
    try {
      tokens = await claims.tokensOf(userId, AbortSignal.timeout(deadlineMs));
    } catch (err) {
      if (!(err instanceof ClaimsUnavailable)) throw err;
      log("claims_unavailable", { user_id: userId, reason: err.reason, status: err.status });
      return c.json({ error: "claims_unavailable" }, 503);
    }
    return c.json({
      user: { id: userId, is_geekykey_admin: geekykeyAdmins.has(userId) },
      tokens: tokens.map(({ uid, claimedAt }) => ({ uid, claimed_at: claimedAt })),
      events,
    });
  });
}
