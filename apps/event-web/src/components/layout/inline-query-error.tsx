import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";

/** Keeps a successful cached screen visible when a background query fails. */
export function InlineQueryError({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2">
        <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span>
          <strong className="font-medium">{title}</strong> {describeError(error)}
        </span>
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <ArrowClockwise aria-hidden />
        Try again
      </Button>
    </div>
  );
}
