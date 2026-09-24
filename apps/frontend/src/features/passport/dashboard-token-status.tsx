import { Key } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { Token } from "@/api/types";
import { Button } from "@/components/ui/button";
import { formatUid } from "@/lib/format";

/** The first thing a new participant must do is pair a token, so this is loud until it is done. */
export function DashboardTokenStatus({ tokens }: { tokens: Token[] }) {
  const first = tokens[0];
  if (!first) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-primary-text/40 bg-primary/15 p-4 dark:bg-primary/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
          <div>
            <p className="font-medium">No token paired yet</p>
            <p className="text-sm text-muted-foreground">
              Pair the token from the registration desk to start collecting stamps.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/pair">Pair token</Link>
        </Button>
      </div>
    );
  }
  return (
    <p className="flex items-center justify-between gap-4 text-sm">
      <span className="inline-flex min-w-0 items-center gap-2">
        <Key className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
        {tokens.length > 1 ? (
          <span>{tokens.length} tokens paired</span>
        ) : (
          <span className="truncate">
            Token <span className="font-mono">{formatUid(first.uid)}</span> paired
          </span>
        )}
      </span>
      <Link
        to="/pair"
        className="shrink-0 font-medium text-primary-text underline-offset-4 hover:underline"
      >
        Manage
      </Link>
    </p>
  );
}
