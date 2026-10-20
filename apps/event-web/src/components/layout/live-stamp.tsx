import { formatTimeWithSeconds } from "@/lib/format";

interface LiveStampProps {
  /** TanStack Query's dataUpdatedAt: epoch milliseconds, 0 until the first response. */
  updatedAt: number;
  refreshing: boolean;
}

/** "Updated 12:01:33" for polled views, so organisers can tell the feed is alive. */
export function LiveStamp({ updatedAt, refreshing }: LiveStampProps) {
  if (!updatedAt) return null;
  const iso = new Date(updatedAt).toISOString();
  return (
    <span className="text-xs text-muted-foreground">
      {refreshing ? "Updating" : "Updated"}{" "}
      <time dateTime={iso} className="font-mono">
        {formatTimeWithSeconds(iso)}
      </time>
    </span>
  );
}
