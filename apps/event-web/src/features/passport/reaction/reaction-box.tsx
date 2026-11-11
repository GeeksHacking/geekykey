import type { KeyboardEvent } from "react";

import { timeLeftLine } from "@/features/passport/reaction/reaction-wording";
import { cn } from "@/lib/utils";

/** The box that waits for green and takes the tap, with the time left above it (FRO-152). */
export function ReactionBox({
  showTimer,
  signal,
  secondsLeft,
  onTap,
}: {
  showTimer: boolean;
  signal: boolean;
  secondsLeft: number;
  onTap: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onTap();
  }

  return (
    <div className="space-y-2">
      {showTimer ? (
        <p aria-live="off" className="text-center font-mono text-sm tabular-nums">
          {timeLeftLine(secondsLeft)}
        </p>
      ) : null}
      <button
        type="button"
        // Focused when it appears, so a keyboard taps with Enter or Space.
        autoFocus
        onPointerDown={onTap}
        onKeyDown={onKeyDown}
        className={cn(
          "grid h-36 w-full touch-manipulation select-none place-items-center rounded-lg text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
          signal ? "bg-status-accepted text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {signal ? "Tap!" : "Wait for green…"}
      </button>
    </div>
  );
}
