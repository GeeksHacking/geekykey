import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";

export const SESSION_COOKIE = "gk_session";

/**
 * One event day. Long enough that nobody is signed out mid-event, short enough
 * that a shared laptop does not stay signed in overnight.
 */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface SessionOptions {
  /** From config.sessionSecret. */
  secret: string;
  /** From config.sessionCookieSecure. */
  secure: boolean;
}

/** Who a session is for. */
export interface SessionUser {
  userId: string;
  /** The name from their login, which a login link carries (the API agreement's 7.2), or null when it had none. */
  name: string | null;
}

/** Sets `userId` and `loginName`, the user behind the cookie, for the handlers after requireSession. */
export type SessionEnv = { Variables: { userId: string; loginName: string | null } };

/*
  Browser sessions for the token page and My tokens. Stations do not use this;
  they carry a bearer key, see src/station-auth.ts.

  The session is the cookie, as on the Event Service: it holds an expiry, a
  user ID and the name from their login, signed with SESSION_SECRET, so a
  forged or edited cookie fails to verify. The GeekyKey Service keeps no
  users, so the cookie is all there is, and it holds the name for the
  login links (the API agreement's 7.2 and 8.6).
  The cookie's name is its own, gk_session, because locally both sets of
  screens are on localhost, where cookies ignore the port, and the Event
  Service's is event_session.
*/

/** What gk_session holds, as JSON: an expiry in milliseconds, the user ID and the login's name. */
const sessionValue = z.object({
  exp: z.number(),
  sub: z.string().min(1),
  name: z.string().nullable(),
});

/**
 * Signs in `user` by setting gk_session. The one place cookie attributes are
 * chosen, so POST /auth/dev-login and POST /auth/firebase cannot drift apart.
 */
export async function issueSession(
  c: Context,
  { userId, name }: SessionUser,
  options: SessionOptions,
): Promise<void> {
  const value = { exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000, sub: userId, name };
  await setSignedCookie(c, SESSION_COOKIE, JSON.stringify(value), options.secret, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: options.secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Signs out the browser holding the cookie. Used by POST /auth/logout. */
export function clearSession(c: Context, options: Pick<SessionOptions, "secure">): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: options.secure });
}

/**
 * The user behind the cookie, or null when there's no usable session: no
 * cookie, one whose signature fails, or one that has expired. There are no
 * users to look up, so a session that checks out is the whole answer. A
 * cookie from before the name was added, `expiry:userId`, isn't JSON, so it
 * reads as none, and the screens log the user in again (7.2).
 */
export async function readSession(
  c: Context,
  options: Pick<SessionOptions, "secret">,
): Promise<SessionUser | null> {
  // false means the signature didn't verify, undefined means there was no cookie.
  const value = await getSignedCookie(c, options.secret, SESSION_COOKIE);
  if (!value) return null;

  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return null;
  }
  const session = sessionValue.safeParse(json);
  if (!session.success) return null;
  const { exp, sub, name } = session.data;
  // The browser already drops the cookie at max-age. This is what expires a copy of it.
  if (exp <= Date.now()) return null;
  return { userId: sub, name };
}

/**
 * Requires a logged-in user and sets `c.var.userId`. Answers 401 with
 * `unauthenticated` otherwise, which the screens read as "logged out" rather
 * than as a failure.
 */
export function requireSession(
  options: Pick<SessionOptions, "secret">,
): MiddlewareHandler<SessionEnv> {
  return async (c, next) => {
    const user = await readSession(c, options);
    if (user === null) return c.json({ error: "unauthenticated" }, 401);
    c.set("userId", user.userId);
    c.set("loginName", user.name);
    return await next();
  };
}
