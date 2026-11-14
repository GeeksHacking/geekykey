/** The sitter's seat's closing time, counted down on the phone. */
export function SeatCountdown({ seconds }: { seconds: number }) {
  return (
    <p aria-live="off" className="mt-1 font-mono text-base font-medium tabular-nums">
      {seconds > 0 ? `Closes in ${seconds}s.` : "Closed."}
    </p>
  );
}
