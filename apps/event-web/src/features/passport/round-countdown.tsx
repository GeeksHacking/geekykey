import { useEffect, useState } from "react";

export function RoundCountdown({ closesAt, duel = false }: { closesAt: string; duel?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(closesAt) - now) / 1000));
  return seconds > 0 ? (
    <p className="font-mono text-base font-medium tabular-nums">
      {duel ? `${seconds}s left to play` : `Teams in ${seconds}s`}
    </p>
  ) : (
    <p role="status" className="text-sm">
      {duel ? "Time is up. Waiting for the result." : "Making the teams…"}
    </p>
  );
}
