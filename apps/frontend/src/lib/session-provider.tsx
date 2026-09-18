import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
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
    retry: false,
    // Stamps and points change while the participant walks around, so keep them fresh.
    refetchInterval: POLL_ME_MS,
  });

  const signIn = useMutation({
    mutationFn: async (userId: string) => {
      await api.devLogin(userId);
      return api.me();
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.me, data),
  });

  const signOut = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me, null);
      // Anything cached for the previous user must not leak to the next one at a shared laptop.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  // While signing out, report "loading" rather than the stale signed-in state. Query hands
  // the null session to React on a later tick than the mutation promise, and a screen that
  // mounted in that gap would otherwise see a user who is already gone.
  const status: SessionStatus =
    me.isPending || signOut.isPending
      ? "loading"
      : me.isError
        ? "error"
        : me.data === null
          ? "anonymous"
          : "authenticated";

  const value = useMemo(
    () => ({
      status,
      me: me.data ?? null,
      error: me.error ?? undefined,
      refresh,
      signIn: signIn.mutateAsync,
      signOut: signOut.mutateAsync,
    }),
    [status, me.data, me.error, refresh, signIn.mutateAsync, signOut.mutateAsync],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
