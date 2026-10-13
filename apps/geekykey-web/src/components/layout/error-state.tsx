import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /**
   * Replaces describeError(error). Pass null to leave the description out, for a code
   * whose whole message the agreement fixes and which therefore belongs in the title
   * alone rather than being said twice.
   */
  description?: string | null;
}

export function ErrorState({
  error,
  onRetry,
  title = "Could not load this",
  description,
}: ErrorStateProps) {
  const detail = description === undefined ? describeError(error) : description;
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center"
    >
      <WarningCircle className="h-8 w-8 text-destructive" aria-hidden />
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      {detail ? <p className="mt-1 max-w-[40ch] text-sm text-muted-foreground">{detail}</p> : null}
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <ArrowClockwise />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
