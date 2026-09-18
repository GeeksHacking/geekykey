import { useCallback, useEffect, useRef, useState } from "react";

/*
  Minimal data hook for the mockup phase. When TanStack Query lands, the
  feature hooks swap this for useQuery and the screens stay untouched.

  - keeps the last data while refetching or polling, so lists do not flicker
  - `key` identifies the query; change it and the hook starts over
  - polling pauses while the tab is hidden
*/

export type RequestStatus = "loading" | "success" | "error";

export interface RequestState<T> {
  status: RequestStatus;
  data: T | undefined;
  error: unknown;
  /** True while a refetch or poll runs and there is already data on screen. */
  refreshing: boolean;
  /** Time of the last successful response. */
  updatedAt: Date | null;
  refetch: () => Promise<void>;
}

export interface RequestOptions {
  key?: string;
  pollMs?: number;
  enabled?: boolean;
}

interface Snapshot<T> {
  key: string;
  status: RequestStatus;
  data: T | undefined;
  error: unknown;
  refreshing: boolean;
  updatedAt: Date | null;
}

export function useRequest<T>(request: () => Promise<T>, options: RequestOptions = {}): RequestState<T> {
  const { key = "", pollMs, enabled = true } = options;

  // The latest request function, without making it a dependency of the effects below.
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  });

  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    key,
    status: "loading",
    data: undefined,
    error: undefined,
    refreshing: false,
    updatedAt: null,
  });

  // Bumped whenever the key changes or the component unmounts, so a slow
  // response for an old query can never overwrite a newer one.
  const runIdRef = useRef(0);

  const run = useCallback(async (runKey: string, background: boolean) => {
    const runId = ++runIdRef.current;
    if (background) setSnapshot((prev) => ({ ...prev, refreshing: prev.data !== undefined }));
    try {
      const data = await requestRef.current();
      if (runId !== runIdRef.current) return;
      setSnapshot({ key: runKey, status: "success", data, error: undefined, refreshing: false, updatedAt: new Date() });
    } catch (error) {
      if (runId !== runIdRef.current) return;
      setSnapshot((prev) => ({
        key: runKey,
        status: "error",
        data: prev.key === runKey ? prev.data : undefined,
        error,
        refreshing: false,
        updatedAt: prev.key === runKey ? prev.updatedAt : null,
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run(key, false);
    return () => {
      runIdRef.current += 1;
    };
  }, [key, enabled, run]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const tick = () => {
      if (document.visibilityState === "visible") void run(key, true);
    };
    const id = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, enabled, pollMs, run]);

  const refetch = useCallback(() => run(key, true), [run, key]);

  // A snapshot from a previous key is stale: report loading until the new one lands.
  const current: Snapshot<T> =
    snapshot.key === key
      ? snapshot
      : { key, status: "loading", data: undefined, error: undefined, refreshing: false, updatedAt: null };

  return { ...current, refetch };
}
