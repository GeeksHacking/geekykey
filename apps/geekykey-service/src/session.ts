import type { Context } from "hono";
import { deleteCookie, setSignedCookie } from "hono/cookie";

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
