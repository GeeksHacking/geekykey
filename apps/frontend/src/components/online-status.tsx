import { WifiHigh, WifiSlash } from "@phosphor-icons/react";

interface OnlineStatusProps {
  /** Whether the station was heard from in the last 120 seconds (agreement 9.2). */
  online: boolean;
  lastSeenAt: string | null;
}

/**
 * Icon plus word in every state, so it survives colour-blindness and bad projector contrast.
 *
 * There is no unknown state. The board had one only while a status call to the GeekyKey
 * Service could fail, and version 0.3 removed that call. A station with no `lastSeenAt` has
 * never been heard from at all, which is a different thing from a fault and reads as
 * "Never connected".
 */
export function OnlineStatus({ online, lastSeenAt }: OnlineStatusProps) {
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
