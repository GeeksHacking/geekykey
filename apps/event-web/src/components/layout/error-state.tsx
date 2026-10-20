import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

export function ErrorState({ error, onRetry, title = "Could not load this" }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center"
    >
      <WarningCircle className="h-8 w-8 text-destructive" aria-hidden />
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-[40ch] text-sm text-muted-foreground">{describeError(error)}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <ArrowClockwise />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
