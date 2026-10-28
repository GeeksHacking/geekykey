import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useApi } from "@/api/context";
import { AUTH_ERROR_EVENT, isApiErrorCode, NetworkError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import type { MeResponse } from "@/api/types";
import { SessionContext, type SessionStatus } from "@/lib/session";

/*
  The session is the ["me"] query on the GeekyKey Service (agreement 8.4). Its data has
  three shapes:
  - undefined: not fetched yet
  - null: the service said 401, nobody is signed in
  - MeResponse: signed in
  A 401 is a normal answer, not an error, which is why the query function turns it into
  null instead of throwing. Real failures still throw.

  Before it settles on null, a 401 logs a returning user in again if Firebase still
  remembers them (agreement 7.2), so the query stays pending and no screen shows the login
  meanwhile. That matters most for a guest: the login would offer "Continue as guest"
  again, which makes a new guest who doesn't own their token.

  Firebase is imported where it's used, so a signed-in user's pages don't load it.
*/
export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [authorizationFailure, setAuthorizationFailure] = useState<{
    error: unknown;
    at: number;
  }>();

  // False from a sign-out until the next sign-in: if Firebase's sign-out failed, it still
  // remembers the user, and logging them straight back in would undo the sign-out.
  const mayLogInAgain = useRef(true);

  // A returning-user login that is still running. A sign-out waits for it, because a
  // POST /auth/firebase that lands after POST /auth/logout would set the cookie again
  // (FRO-69).
  const loginAgainInFlight = useRef<Promise<MeResponse | null> | null>(null);

  // Sign-ins that are running. A returning login must not start while one is, or its
  // POST /auth/firebase could land after the sign-in's and set the cookie back to the
  // previous user (FRO-91).
  const signInsInFlight = useRef(0);

  // The session's version. A /me that was asked for under an older version must not act
  // on its answer, because a sign-in or sign-out may have changed the session since
  // (FRO-91).
  const sessionVersion = useRef(0);

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      const version = sessionVersion.current;
      try {
        return await api.me();
      } catch (error) {
        if (isApiErrorCode(error, "unauthenticated")) return logInAgain(version);
        throw error;
      }
    },
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 2,
  });

  // Any failure here only means the login shows, as it would have without this.
  function logInAgain(version: number): Promise<MeResponse | null> {
    if (!mayLogInAgain.current) return Promise.resolve(null);
    // The session changed since this /me was sent, so its 401 describes a session that is
    // no longer there. A login now would undo the sign-in that replaced it (FRO-91).
    if (version !== sessionVersion.current) return Promise.resolve(null);
    // The sign-in that is running has to be the last write to the session cookie, so a
    // 401 that arrives while it runs does not start a returning login (FRO-91).
    if (signInsInFlight.current > 0) return Promise.resolve(null);
    // One login at a time, so a sign-out has one promise to wait for and two /me reads
    // cannot send two logins.
    if (loginAgainInFlight.current) return loginAgainInFlight.current;
    const login = (async (): Promise<MeResponse | null> => {
      try {
        const { savedUserIdToken } = await import("@/lib/firebase");
        const idToken = await savedUserIdToken();
        if (!idToken) return null;
        await api.firebaseLogin(idToken);
        return await api.me();
      } catch (error) {
        console.error("Logging a returning user in again failed", error);
        return null;
      }
    })();
    loginAgainInFlight.current = login;
    void login.finally(() => {
      if (loginAgainInFlight.current === login) loginAgainInFlight.current = null;
    });
    return login;
  }

  const clearIdentityQueries = useCallback(() => {
    // A shared browser must not show the previous user's tokens.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }, [queryClient]);

  // The global reaction to an identity-scoped 401 or 403, so a form elsewhere in the app
  // can end the session without every caller knowing about the query.
  useEffect(() => {
    const onAuthError = (event: Event) => {
      const error = (event as CustomEvent<unknown>).detail;
      if (isApiErrorCode(error, "unauthenticated")) {
        clearIdentityQueries();
        // Back to loading rather than to null, so /me asks again and a returning user is
        // logged in again before any screen shows the login. A 401 from /me itself, or
        // from another request while /me is asking, is already being answered there.
        if (queryClient.isFetching({ queryKey: queryKeys.me }) === 0) {
          void queryClient.resetQueries({ queryKey: queryKeys.me });
        }
      } else if (isApiErrorCode(error, "forbidden")) {
        setAuthorizationFailure({ error, at: Date.now() });
      }
    };
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, onAuthError);
  }, [clearIdentityQueries, queryClient]);

  /**
   * Every write of the session goes through here. A poll asked for before the write answers
   * with the session as it was then, so the write drops it, or its late answer would undo
   * the new session.
   */
  const settleSession = useCallback(
    (data: MeResponse | null) => {
      // A new version, so a /me that was asked for before this write cannot act on its
      // answer. Its 401 must not start a returning login that would undo the new session
      // (FRO-91).
      sessionVersion.current += 1;
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData(queryKeys.me, data);
    },
    [queryClient],
  );

  const clearForSignIn = useCallback(() => {
    // Count the sign-in before the cancel below, so a 401 already on its way cannot
    // start a returning login during it (FRO-91).
    signInsInFlight.current += 1;
    // Drop a pre-login poll so its late response cannot overwrite the new identity, and
    // clear the session before the request so a failed sign-in cannot leave the old
    // account visible.
    settleSession(null);
    setAuthorizationFailure(undefined);
    clearIdentityQueries();
  }, [clearIdentityQueries, settleSession]);

  const finishSignIn = useCallback(() => {
    signInsInFlight.current -= 1;
  }, []);

  const completeSignIn = useCallback(
    (data: MeResponse) => {
      mayLogInAgain.current = true;
      settleSession(data);
    },
    [settleSession],
  );

  // A returning login that was already running must land first, or its POST /auth/firebase
  // could set the cookie after this sign-in's and undo it (FRO-91). The wait has no
  // deadline, as the sign-out's wait has none (FRO-69).
  const signInAndReadMe = useCallback(
    async (request: () => Promise<void>): Promise<MeResponse> => {
      await loginAgainInFlight.current;
      await request();
      return api.me();
    },
    [api],
  );

  const signIn = useMutation({
    mutationFn: (userId: string) => signInAndReadMe(() => api.devLogin(userId)),
    onMutate: clearForSignIn,
    onSuccess: completeSignIn,
    // A failed sign-in leaves the screens signed out, so the session is settled again
    // here, and a poll that was asked for before the failure cannot bring the old
    // account back.
    onError: () => settleSession(null),
    onSettled: finishSignIn,
  });

  // Agreement 7.2: the screens sign in with the ID token Firebase's web SDK gave them, and
  // the service sets its own cookie. The screens read GET /api/v1/me as usual afterwards.
  // A returning user's login goes through the /me query instead (logInAgain), so it
  // never shows as a sign-in on the login screen.
  const signInWithFirebase = useMutation({
    mutationFn: (idToken: string) => signInAndReadMe(() => api.firebaseLogin(idToken)),
    onMutate: clearForSignIn,
    onSuccess: completeSignIn,
    onError: () => settleSession(null),
    onSettled: finishSignIn,
  });

  const signOut = useMutation({
    mutationFn: async () => {
      // Agreement 7.3: the screens also sign out of Firebase, so a shared device does not
      // stay signed in to Firebase. Firebase goes first, because agreement 7.2 has the
      // screens sign a returning user in again whenever Firebase still has them, and a
      // sign-out that left it signed in would sign the same person straight back in. Its
      // failure is logged and not fatal: the service's cookie is the session, and the user
      // has to see that failing.
      try {
        const { signOutOfFirebase } = await import("@/lib/firebase");
        await signOutOfFirebase();
      } catch (error) {
        console.error("Signing out of Firebase failed", error);
      }
      // A returning-user login that was already running may still have POST /auth/firebase
      // to send. Let it finish, so this logout is the last write to the session cookie and
      // the login cannot set it again afterwards (FRO-69).
      await loginAgainInFlight.current;
      return api.logout();
    },
    onMutate: () => {
      mayLogInAgain.current = false;
      // Drop a poll that could otherwise restore the old identity after logout starts, and
      // hide cached identity data even if the network request later fails.
      settleSession(null);
      setAuthorizationFailure(undefined);
      clearIdentityQueries();
    },
    onSuccess: () => {
      settleSession(null);
      clearIdentityQueries();
    },
    onError: () => {
      settleSession(null);
      clearIdentityQueries();
    },
  });

  const refresh = useCallback(async () => {
    setAuthorizationFailure(undefined);
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const authorizationError =
    authorizationFailure && me.dataUpdatedAt <= authorizationFailure.at
      ? authorizationFailure.error
      : undefined;

  // While a session transition is running, report "loading" rather than the stale state. A query
  // hands the null session to React on a later tick than the mutation promise, so a screen mounted
  // in that gap must not redirect or render the previous user.
  const status: SessionStatus =
    me.isPending || signIn.isPending || signInWithFirebase.isPending || signOut.isPending
      ? "loading"
      : me.isError && me.data === undefined
        ? "error"
        : me.data === null
          ? "anonymous"
          : "authenticated";

  const value = useMemo(
    () => ({
      status,
      me: me.data ?? null,
      error: me.error ?? signIn.error ?? signInWithFirebase.error ?? signOut.error,
      authorizationError,
      refresh,
      signIn: signIn.mutateAsync,
      signInWithFirebase: signInWithFirebase.mutateAsync,
      signOut: signOut.mutateAsync,
    }),
    [
      status,
      me.data,
      me.error,
      authorizationError,
      signIn.error,
      signIn.mutateAsync,
      signInWithFirebase.error,
      signInWithFirebase.mutateAsync,
      signOut.error,
      signOut.mutateAsync,
      refresh,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
