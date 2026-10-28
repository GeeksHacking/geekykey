import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useApi } from "@/api/context";
import { AUTH_ERROR_EVENT, isApiErrorCode, NetworkError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import type { MeResponse } from "@/api/types";
import { POLL_ME_MS } from "@/lib/constants";
import { SessionContext, type SessionStatus } from "@/lib/session";

/*
  The session is the ["me"] query. Its data has three shapes:
  - undefined: not fetched yet
  - null: the backend said 401, nobody is signed in
  - MeResponse: signed in
  A 401 is a normal answer, not an error, which is why the query function
  turns it into null instead of throwing. Real failures still throw.

  `loginLink` is the link the page arrived with, from takeLoginLink() in
  lib/login-link.ts. The first /me sends it before it reads, so nothing reads the
  session the browser had before the link replaces it (agreement 7.4).

  Firebase is imported where it's used, so the pages that never sign out don't load it.
*/
export function SessionProvider({
  children,
  loginLink,
}: {
  children: ReactNode;
  loginLink?: string;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [authorizationFailure, setAuthorizationFailure] = useState<{
    error: unknown;
    at: number;
  }>();
  // A link works once, so it is sent once, however often /me is read afterwards.
  const unsentLoginLink = useRef(loginLink);
  const [loginLinkError, setLoginLinkError] = useState<unknown>();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      const link = unsentLoginLink.current;
      if (link !== undefined) {
        unsentLoginLink.current = undefined;
        try {
          await api.loginLink(link);
        } catch (error) {
          // The session the browser had carries on underneath, so /me is read as usual.
          setLoginLinkError(error);
        }
      }
      try {
        return await api.me();
      } catch (error) {
        if (isApiErrorCode(error, "unauthenticated")) return null;
        throw error;
      }
    },
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 2,
    // Stamps and points change while the participant walks around, so keep them fresh,
    // but only while someone is signed in. A 401 is a normal answer whose data is null,
    // and the timer starts again when a login puts a session in the cache.
    refetchInterval: (query) => (query.state.data ? POLL_ME_MS : false),
  });

  const clearIdentityQueries = useCallback(() => {
    // A shared browser must not show the previous account's stations, taps, or stats.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }, [queryClient]);

  /**
   * Every write of the session goes through here. A poll asked for before the write answers
   * with the session as it was then, so the write drops it, or its late answer would undo
   * the new session.
   */
  const settleSession = useCallback(
    (data: MeResponse | null) => {
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData(queryKeys.me, data);
    },
    [queryClient],
  );

  useEffect(() => {
    const onAuthError = (event: Event) => {
      const error = (event as CustomEvent<unknown>).detail;
      if (isApiErrorCode(error, "unauthenticated")) {
        settleSession(null);
        clearIdentityQueries();
      } else if (isApiErrorCode(error, "forbidden")) {
        setAuthorizationFailure({ error, at: Date.now() });
      }
    };
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, onAuthError);
  }, [clearIdentityQueries, settleSession]);

  const clearForSignIn = useCallback(() => {
    // Drop a pre-login poll so its late response cannot overwrite the new identity, and
    // clear the session before the request so a failed sign-in cannot leave the old
    // account visible.
    settleSession(null);
    setAuthorizationFailure(undefined);
    setLoginLinkError(undefined);
    clearIdentityQueries();
  }, [clearIdentityQueries, settleSession]);

  const signIn = useMutation({
    mutationFn: async (userId: string) => {
      await api.devLogin(userId);
      return api.me();
    },
    onMutate: clearForSignIn,
    onSuccess: (data) => settleSession(data),
    // A failed sign-in leaves the screens signed out, so the session is settled again
    // here, and a poll that was asked for before the failure cannot bring the old
    // account back.
    onError: () => settleSession(null),
  });

  // Agreement 7.2: the screens sign in with the ID token Firebase's web SDK gave them, and
  // the service sets its own cookie. The screens read GET /api/v1/me as usual afterwards.
  // FRO-59's returning-user sign-in comes through here too, so there is one path to the
  // service.
  const signInWithFirebase = useMutation({
    mutationFn: async (idToken: string) => {
      await api.firebaseLogin(idToken);
      return api.me();
    },
    onMutate: clearForSignIn,
    onSuccess: (data) => settleSession(data),
    onError: () => settleSession(null),
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
      return api.logout();
    },
    onMutate: () => {
      // Drop a poll that could otherwise restore the old identity after logout starts, and
      // hide cached identity data even if the network request later fails.
      settleSession(null);
      setAuthorizationFailure(undefined);
      setLoginLinkError(undefined);
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
  // hands the null session to React on a later tick than the mutation promise, and a screen mounted
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
      loginLinkError,
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
      loginLinkError,
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
