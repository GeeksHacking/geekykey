import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Db } from "../db/pool.ts";
import { hasName } from "./display-names.ts";
import { users } from "./schema.ts";

export const SESSION_COOKIE = "event_session";

/**
 * One event day. Long enough that nobody is signed out mid-event, short enough
 * that a shared organiser laptop does not stay signed in overnight.
 */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type Role = "participant" | "organizer";

export interface SessionUser {
  id: string;
  displayName: string;
  /** False while the user has the default name (display-names.ts). */
  hasName: boolean;
  role: Role;
}

/** Reads the request's `db`, and sets `user` for the handlers after it. */
export type SessionEnv = { Variables: { db: Db; user: SessionUser } };

export interface SessionOptions {
  /** From config.sessionSecret. */
  secret: string;
  /** From config.sessionCookieSecure. */
  secure: boolean;
  maxAgeSeconds?: number;
  /** From config.organizers: who is an organizer. Everyone else is a participant. */
  organizers: ReadonlySet<string>;
}

/*
  Browser sessions for participants and organizers. Stations do not use this;
  they call the GeekyKey Service with a bearer key (apps/geekykey-service).

  The session is the cookie. There is no sessions table: the cookie holds an
  expiry and a user ID, signed with the configured secret, so a forged or edited
  cookie fails to verify. That keeps sign-in to one HTTP round trip and adds no
  schema. The cost is that signing out cannot invalidate a cookie already in
  someone's hands, it can only remove it from that browser. Acceptable while a
  session lasts one event day. Revisit if sessions ever outlive an event.
*/

/**
 * Signs in `userId` by setting event_session. The one place cookie attributes are
 * chosen, so POST /auth/dev-login and GET /auth/callback cannot drift apart.
 */
export async function issueSession(
  c: Context,
  userId: string,
  options: SessionOptions,
): Promise<void> {
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const expiresAt = Date.now() + maxAge * 1000;
  await setSignedCookie(c, SESSION_COOKIE, `${expiresAt}:${userId}`, options.secret, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: options.secure,
    maxAge,
  });
}

/** Signs out the browser holding the cookie. Used by POST /auth/logout. */
export function clearSession(c: Context, options: Pick<SessionOptions, "secure">): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: options.secure });
}

/**
 * The user behind the cookie, or null when there is no usable session. Null
 * covers all of: no cookie, a cookie that fails its signature, an expired one,
 * and one naming a user who no longer exists. Their role comes from the
 * organizer list, checked on every request, so a change to it takes effect
 * without anyone signing in again.
 */
export async function readSession(
  c: Context<SessionEnv>,
  options: SessionOptions,
): Promise<SessionUser | null> {
  // false means the signature did not verify, undefined means there was no cookie.
  const value = await getSignedCookie(c, options.secret, SESSION_COOKIE);
  if (!value) return null;

  // `expiry:userId`. Split on the first colon only: portal user IDs may contain one.
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const expiresAt = Number(value.slice(0, separator));
  const userId = value.slice(separator + 1);
  if (!userId || !Number.isFinite(expiresAt)) return null;
  // The browser already drops the cookie at max-age. This is what expires a copy of it.
  if (expiresAt <= Date.now()) return null;

  const [user] = await c.var.db
    .select({ id: users.id, displayName: users.displayName, nameSetAt: users.nameSetAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    hasName: hasName(user),
    role: options.organizers.has(user.id) ? "organizer" : "participant",
  };
}

/**
 * Requires a signed-in user and sets `c.var.user`. Answers 401 with
 * `unauthenticated` otherwise, which the frontend reads as "signed out" rather
 * than as a failure.
 */
export function requireSession(options: SessionOptions): MiddlewareHandler<SessionEnv> {
  return async (c, next) => {
    const user = await readSession(c, options);
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    c.set("user", user);
    return next();
  };
}

/** Restricts a route to one role. Mount it after requireSession, never alone. */
export function requireRole(role: Role): MiddlewareHandler<SessionEnv> {
  return async (c, next) => {
    if (c.var.user.role !== role) return c.json({ error: "forbidden" }, 403);
    return await next();
  };
}
