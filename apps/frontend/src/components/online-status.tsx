import { WifiHigh, WifiSlash } from "@phosphor-icons/react";

interface OnlineStatusProps {
  online: boolean;
  lastSeenAt: string | null;
}

/** Icon plus word in every state, so it survives colour-blindness and bad projector contrast. */
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
