import { createContext, useContext } from "react";

import type { MeResponse } from "@/api/types";

/*
  "Am I logged in" is GET /api/v1/me on the GeekyKey Service (agreement 8.4). The
  session cookie is HttpOnly, so this context is the only place the app knows who
  is signed in.

  The GeekyKey Service keeps no users, so there is no display name and no role here:
  `me.user` is { id, is_geekykey_admin }.
*/

export type SessionStatus = "loading" | "anonymous" | "authenticated" | "error";

export interface SessionState {
  status: SessionStatus;
  /** Kept during background refreshes and errors so screens do not blank out. */
  me: MeResponse | null;
  error: unknown;
  /**
   * A recent 403 from an identity-scoped request, for a screen that gates on
   * `is_geekykey_admin`. Clear it with refresh().
   */
  authorizationError?: unknown;
  /** Re-fetch /me. Call after anything that changes tokens. */
  refresh: () => Promise<void>;
  /** Dev-login with a user ID. Resolves with the fresh /me payload. */
  signIn: (userId: string) => Promise<MeResponse>;
  /**
   * Sign in with the ID token Firebase's web SDK gave the screens (agreement 7.2).
   * Resolves with the fresh /me payload.
   */
  signInWithFirebase: (idToken: string) => Promise<MeResponse>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** For screens inside <RequireSession>: the signed-in user's /me payload, never null. */
export function useMe(): { me: MeResponse; refresh: () => Promise<void> } {
  const session = useSession();
  if (!session.me) {
    throw new Error("useMe needs an authenticated session. Wrap the screen in <RequireSession>.");
  }
  return { me: session.me, refresh: session.refresh };
}

/** The signed-in user's ID, for screens that only need to know who this is. */
export function useIsGeekyKeyAdmin(): boolean {
  return useMe().me.user.is_geekykey_admin;
}
