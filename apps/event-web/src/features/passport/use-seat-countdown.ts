import { useEffect, useState } from "react";

/**
 * The sitter's seat's clock: the seconds left and whether it has closed (BAC-190, FRO-179). One
 * timer, so the card's state and the countdown can't disagree.
 */
export function useSeatCountdown(closesAt: string, enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [enabled]);
  const seconds = enabled ? Math.max(0, Math.ceil((Date.parse(closesAt) - now) / 1000)) : 0;
  return { seconds, closed: enabled && seconds <= 0 };
}
