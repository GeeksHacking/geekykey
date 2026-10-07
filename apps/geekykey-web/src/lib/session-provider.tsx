import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
*/
export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [authorizationFailure, setAuthorizationFailure] = useState<{
    error: unknown;
    at: number;
  }>();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api.me();
      } catch (error) {
        if (isApiErrorCode(error, "unauthenticated")) return null;
        throw error;
      }
    },
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 2,
  });

  const clearIdentityQueries = useCallback(() => {
    // A shared browser must not show the previous account's tokens or stations.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }, [queryClient]);

  // The global reaction to an identity-scoped 401 or 403, so a form elsewhere in the app
  // can end the session without every caller knowing about the query.
  useEffect(() => {
    const onAuthError = (event: Event) => {
      const error = (event as CustomEvent<unknown>).detail;
      if (isApiErrorCode(error, "unauthenticated")) {
        queryClient.setQueryData(queryKeys.me, null);
        clearIdentityQueries();
      } else if (isApiErrorCode(error, "forbidden")) {
        setAuthorizationFailure({ error, at: Date.now() });
      }
    };
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, onAuthError);
  }, [clearIdentityQueries, queryClient]);

  const signIn = useMutation({
    mutationFn: async (userId: string) => {
      await api.devLogin(userId);
      return api.me();
    },
    onMutate: () => {
      // Cancel a pre-login poll so its late response cannot overwrite the new identity.
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      // Clear before the request so a failed sign-in cannot leave the old account visible.
      queryClient.setQueryData(queryKeys.me, null);
      setAuthorizationFailure(undefined);
      clearIdentityQueries();
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.me, data),
  });

  const signOut = useMutation({
    mutationFn: () => api.logout(),
    onMutate: () => {
      // Cancel a poll that could otherwise restore the old identity after logout starts.
      void queryClient.cancelQueries({ queryKey: queryKeys.me });
      // Hide cached identity data even if the network request later fails.
      queryClient.setQueryData(queryKeys.me, null);
      setAuthorizationFailure(undefined);
      clearIdentityQueries();
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me, null);
      clearIdentityQueries();
    },
    onError: () => {
      queryClient.setQueryData(queryKeys.me, null);
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
    me.isPending || signIn.isPending || signOut.isPending
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
      error: me.error ?? signIn.error ?? signOut.error,
      authorizationError,
      refresh,
      signIn: signIn.mutateAsync,
      signOut: signOut.mutateAsync,
    }),
    [
      status,
      me.data,
      me.error,
      authorizationError,
      signIn.error,
      signIn.mutateAsync,
      signOut.error,
      signOut.mutateAsync,
      refresh,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
