import { formatTimeWithSeconds } from "@/lib/format";

interface LiveStampProps {
  updatedAt: Date | null;
  refreshing: boolean;
}

/** "Updated 12:01:33" for polled views, so organisers can tell the feed is alive. */
export function LiveStamp({ updatedAt, refreshing }: LiveStampProps) {
  if (!updatedAt) return null;
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {refreshing ? "Updating" : "Updated"}{" "}
      <time dateTime={updatedAt.toISOString()} className="font-mono">
        {formatTimeWithSeconds(updatedAt.toISOString())}
      </time>
    </span>
  );
}
