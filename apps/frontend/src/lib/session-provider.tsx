import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
*/
export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [authorizationError, setAuthorizationError] = useState<unknown>();

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
    // Stamps and points change while the participant walks around, so keep them fresh.
    refetchInterval: POLL_ME_MS,
  });

  const clearIdentityQueries = useCallback(() => {
    // A shared browser must not show the previous account's stations, taps, or stats.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }, [queryClient]);

  useEffect(() => {
    const onAuthError = (event: Event) => {
      const error = (event as CustomEvent<unknown>).detail;
      if (isApiErrorCode(error, "unauthenticated")) {
        queryClient.setQueryData(queryKeys.me, null);
        clearIdentityQueries();
      } else if (isApiErrorCode(error, "forbidden")) {
        setAuthorizationError(error);
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
      // Clear before the request so a failed sign-in cannot leave the old account visible.
      queryClient.setQueryData(queryKeys.me, null);
      setAuthorizationError(undefined);
      clearIdentityQueries();
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.me, data),
  });

  const signOut = useMutation({
    mutationFn: () => api.logout(),
    onMutate: () => {
      // Hide cached identity data even if the network request later fails.
      queryClient.setQueryData(queryKeys.me, null);
      setAuthorizationError(undefined);
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
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  // While a session transition is running, report "loading" rather than the stale state. A query
  // hands the null session to React on a later tick than the mutation promise, and a screen mounted
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
