import { ArrowClockwise, Clock } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

/*
  Stands in for the red error state when a poll is rate limited. Muted rather than
  destructive, because the data on screen is real and only slightly old: the Event
  Service answers 429 with Retry-After: 60 (agreement section 2, "Rate limits").

  The retry button is deliberate but manual. The next poll would try again on its
  own, so clicking is never required to recover, and the copy says to wait rather
  than implying another request succeeds straight away.
*/
export function StaleDataNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">
          <strong className="font-medium text-foreground">Showing the last update.</strong> Too many
          requests, so this may be a moment old. It updates again on its own.
        </span>
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <ArrowClockwise aria-hidden />
        Try again
      </Button>
    </div>
  );
}
