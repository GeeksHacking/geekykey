import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useApi } from "@/api/context";
import { isApiErrorCode } from "@/api/errors";
import type { MeResponse } from "@/api/types";
import { SessionContext, type SessionStatus } from "@/lib/session";

interface Snapshot {
  status: SessionStatus;
  me: MeResponse | null;
  error: unknown;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading", me: null, error: undefined });

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setSnapshot({ status: "authenticated", me, error: undefined });
    } catch (error) {
      if (isApiErrorCode(error, "unauthenticated")) {
        setSnapshot({ status: "anonymous", me: null, error: undefined });
      } else {
        setSnapshot((prev) => ({ status: "error", me: prev.me, error }));
      }
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (userId: string) => {
      await api.devLogin(userId);
      const me = await api.me();
      setSnapshot({ status: "authenticated", me, error: undefined });
      return me;
    },
    [api],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setSnapshot({ status: "anonymous", me: null, error: undefined });
  }, [api]);

  const value = useMemo(
    () => ({ ...snapshot, refresh, signIn, signOut }),
    [snapshot, refresh, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
