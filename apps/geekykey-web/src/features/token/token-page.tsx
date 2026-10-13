import { describeError, isApiErrorCode } from "@/api/errors";
import { ErrorState } from "@/components/layout/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWhen } from "@/lib/format";
import { formatUid } from "@/lib/token-uid";
import { useToken } from "@/features/token/use-token";

/**
 * The token page, `/t/<UID>` (agreement 8.5). Someone taps a token with a phone, so
 * this is read-only and mobile first: one question answered, nothing to scroll past.
 *
 * What it shows is decided by `owner`: "nobody" for an unclaimed token, "you" for your
 * own with when you claimed it, "someone_else" with nothing but the sentence. The owner
 * is never named: 8.5 gives `owner_id` only to a GeekyKey admin, and the mock enforces
 * that, so there is no name or ID on this screen to leak.
 *
 * Claiming and releasing are FRO-22 and FRO-23, so nothing here mutates.
 */
export function TokenPage({ uid }: { uid: string }) {
  const query = useToken(uid);
  const displayed = formatUid(uid);

  return (
    <main className="flex flex-col px-1 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">Your token</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <code className="font-mono text-foreground">{displayed}</code>
      </p>

      <div className="mt-8" aria-live="polite">
        {query.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <span className="sr-only">Loading</span>
          </div>
        ) : query.isError ? (
          <TokenError error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.owner === "nobody" ? (
          <p className="text-base">Nobody has claimed this token yet.</p>
        ) : query.data.owner === "you" ? (
          <YouOwnIt claimedAt={query.data.claimed_at} />
        ) : (
          <p className="text-base">This token belongs to someone else.</p>
        )}
      </div>
    </main>
  );
}

function YouOwnIt({ claimedAt }: { claimedAt: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base">This is your token.</p>
      {claimedAt ? (
        <p className="text-sm text-muted-foreground">Claimed {formatWhen(claimedAt)}.</p>
      ) : null}
    </div>
  );
}

/**
 * claims_unavailable and rate_limited have wording agreement section 13 fixes, and that
 * wording is the whole message. So the title carries it and ErrorState's own description
 * is left empty rather than saying the same thing twice.
 */
function titleFor(error: unknown): string | undefined {
  if (isApiErrorCode(error, "claims_unavailable") || isApiErrorCode(error, "rate_limited")) {
    return describeError(error);
  }
  return undefined;
}

/**
 * An address that is not a token's UID is the likeliest failure here, since the URL is
 * typed by hand as often as it is tapped, so it says so rather than "could not load".
 */
function TokenError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isApiErrorCode(error, "validation_failed")) {
    return <p className="text-base">This isn't a GeekyKey token address.</p>;
  }
  // claims_unavailable and rate_limited carry wording agreement section 13 fixes, which
  // describeError already returns verbatim; they still get a retry.
  return (
    <ErrorState
      error={error}
      onRetry={onRetry}
      title={titleFor(error) ?? "Could not load this token"}
      description={titleFor(error) ? null : undefined}
    />
  );
}
