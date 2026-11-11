// oxlint-disable react/set-state-in-effect -- the deadline is an external event, not a render value
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { queryKeys } from "@/api/keys";

/**
 * The time left in a connection's reaction test (FRO-152), counted down while it is on screen.
 * At zero it reads /me again, because the service records the missed play; the answer, not this
 * clock, decides the result. A failed read keeps a retry available.
 *
 * The interval runs only while `active`, so a played test and a duel's own countdown cost
 * nothing. The sentence it feeds is hidden from screen readers, so a tick isn't announced.
 */
export function useReactionClock(playBy: string, active: boolean) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(() => active && Date.parse(playBy) <= Date.now());
  const [failed, setFailed] = useState(false);
  const deadlineCheckStarted = useRef(false);

  const secondsLeft = Math.max(0, Math.ceil((Date.parse(playBy) - now) / 1000));

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  const check = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      if (queryClient.getQueryState(queryKeys.me)?.status === "error") setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!active || deadlineCheckStarted.current) return;
    if (Date.parse(playBy) <= now) {
      deadlineCheckStarted.current = true;
      void check();
    }
  }, [active, check, now, playBy]);

  return { secondsLeft, checking, failed, retry: check };
}
