import type { ErrorComponentProps } from "@tanstack/react-router";

import { ErrorState } from "@/components/layout/error-state";
import { Wordmark } from "@/components/layout/wordmark";

export function RootError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6">
      <div className="w-full max-w-md text-center">
        <Wordmark />
        <div className="mt-6">
          <ErrorState error={error} onRetry={reset} title="The app hit an unexpected error" />
        </div>
      </div>
    </main>
  );
}
