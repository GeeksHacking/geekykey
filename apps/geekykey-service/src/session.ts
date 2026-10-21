import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

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

/** Sets `userId`, the user behind the cookie, for the handlers after requireSession. */
export type SessionEnv = { Variables: { userId: string } };

/*
  Browser sessions for the token page and My tokens. Stations do not use this;
  they carry a bearer key, see src/station-auth.ts.

  The session is the cookie, as on the Event Service: it holds an expiry and a
  user ID, signed with SESSION_SECRET, so a forged or edited cookie fails to
  verify. The GeekyKey Service keeps no users, so the user ID is all there is.
  The cookie's name is its own, gk_session, because locally both sets of
  screens are on localhost, where cookies ignore the port, and the Event
  Service's is event_session.
*/

/**
 * Signs in `userId` by setting gk_session. The one place cookie attributes are
 * chosen, so POST /auth/dev-login and POST /auth/firebase cannot drift apart.
 */
export async function issueSession(
  c: Context,
  userId: string,
  options: SessionOptions,
): Promise<void> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  await setSignedCookie(c, SESSION_COOKIE, `${expiresAt}:${userId}`, options.secret, {
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
 * The user ID behind the cookie, or null when there's no usable session: no
 * cookie, one whose signature fails, or one that has expired. There are no
 * users to look up, so a session that checks out is the whole answer.
 */
export async function readSession(
  c: Context,
  options: Pick<SessionOptions, "secret">,
): Promise<string | null> {
  // false means the signature didn't verify, undefined means there was no cookie.
  const value = await getSignedCookie(c, options.secret, SESSION_COOKIE);
  if (!value) return null;

  // `expiry:userId`. Split on the first colon only: a user ID may hold one.
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const expiresAt = Number(value.slice(0, separator));
  const userId = value.slice(separator + 1);
  if (!userId || !Number.isFinite(expiresAt)) return null;
  // The browser already drops the cookie at max-age. This is what expires a copy of it.
  if (expiresAt <= Date.now()) return null;
  return userId;
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
    const userId = await readSession(c, options);
    if (userId === null) return c.json({ error: "unauthenticated" }, 401);
    c.set("userId", userId);
    return await next();
  };
}
