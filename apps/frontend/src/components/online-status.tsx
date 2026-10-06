import { QuestionMark, WifiHigh, WifiSlash } from "@phosphor-icons/react";

interface OnlineStatusProps {
  /** Null when the GeekyKey Service's status call failed (agreement 9.2). */
  online: boolean | null;
  lastSeenAt: string | null;
}

/**
 * Icon plus word in every state, so it survives colour-blindness and bad projector contrast.
 *
 * An unknown status reads as unknown, never as offline. Agreement 9.2 is explicit: showing a
 * healthy station as offline would send an organiser to restart it for no reason.
 */
export function OnlineStatus({ online, lastSeenAt }: OnlineStatusProps) {
  if (online === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-unknown">
        <QuestionMark weight="bold" className="h-4 w-4" aria-hidden />
        Status unknown
      </span>
    );
  }
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-accepted">
        <WifiHigh weight="bold" className="h-4 w-4" aria-hidden />
        Online
      </span>
    );
  }
  if (!lastSeenAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <WifiSlash weight="bold" className="h-4 w-4" aria-hidden />
        Never connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-cooldown">
      <WifiSlash weight="bold" className="h-4 w-4" aria-hidden />
      Offline
    </span>
  );
}
