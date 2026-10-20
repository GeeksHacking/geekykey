import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";

/** Shows a delayed session refresh without hiding the last authenticated screen. */
export function SessionErrorBanner({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <span className="flex items-start gap-2">
        <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span>Live updates are delayed. {describeError(error)}</span>
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <ArrowClockwise aria-hidden />
        Retry
      </Button>
    </div>
  );
}
