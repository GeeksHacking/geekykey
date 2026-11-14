import { useEffect, useState } from "react";

/** The sitter's seat's closing time, counted down on the phone (BAC-190, FRO-179). */
export function SeatCountdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(closesAt) - now) / 1000));
  return (
    <p aria-live="off" className="mt-1 font-mono text-base font-medium tabular-nums">
      {seconds > 0 ? `Closes in ${seconds}s.` : "Closed."}
    </p>
  );
}
