import { Link } from "@tanstack/react-router";

import { describeError, isApiErrorCode } from "@/api/errors";
import { ErrorState } from "@/components/layout/error-state";
import { ReleaseTokenBlock } from "@/components/release-token-block";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWhen } from "@/lib/format";
import { formatUid } from "@/lib/token-uid";
import { HOME_PATH } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { useReleaseToken } from "@/lib/use-release-token";
import type { TokenLookup } from "@/api/types";
import { useClaimToken } from "@/features/token/use-claim-token";
import { useToken } from "@/features/token/use-token";

/**
 * The token page, `/t/<UID>` (agreement 8.5), with Claim (8.2) and Release (8.3). Someone
 * taps a token with a phone, so this is mobile first: one question answered, nothing to
 * scroll past.
 *
 * What it shows is decided by `owner`: "nobody" for an unclaimed token, which gets Claim,
 * "you" for your own with when you claimed it and a Release, and "someone_else" with
 * nothing but the sentence unless the signed-in user is a GeekyKey admin, who also gets a
 * Release. The owner is never named: 8.5 gives `owner_id` only to a GeekyKey admin, and the
 * mock enforces that, so there is no name or ID on this screen to leak.
 *
 * The buttons for each event in the owner's view are FRO-31.
 */
export function TokenPage({ uid }: { uid: string }) {
  const query = useToken(uid);
  const claim = useClaimToken(uid);
  const release = useReleaseToken(uid);
  const { me } = useSession();
  const displayed = formatUid(uid);

  return (
    <main className="flex flex-col px-1 py-4">
      <h1 className="text-2xl font-semibold tracking-heading">Your token</h1>
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
        ) : (
          <OwnerView
            lookup={query.data}
            claim={claim}
            release={release}
            isAdmin={me?.user.is_geekykey_admin ?? false}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Agreement 8.2 fixes the order of the service's checks, so a failure here says which
 * answer the user gets. token_limit_reached and token_taken both name their next step, and
 * neither is a page-level failure worth replacing the whole view for.
 */
function OwnerView({
  lookup,
  claim,
  release,
  isAdmin,
}: {
  lookup: TokenLookup;
  claim: ReturnType<typeof useClaimToken>;
  release: ReturnType<typeof useReleaseToken>;
  isAdmin: boolean;
}) {
  const failure = claim.error;
  const { owner, claimed_at: claimedAt, owner_id: ownerId } = lookup;

  if (isApiErrorCode(failure, "token_limit_reached")) {
    return (
      <p className="text-base text-destructive">
        You already have 3 tokens.{" "}
        <Link to={HOME_PATH} className="underline underline-offset-4">
          Release one on My tokens
        </Link>{" "}
        first.
      </p>
    );
  }

  if (failure && !isApiErrorCode(failure, "token_taken")) {
    return <ClaimError error={failure} onRetry={() => claim.mutate()} />;
  }

  // Agreement 13: on token_taken the sentence sits above whatever a fresh lookup answers,
  // including nobody, so a user who lost the claim still learns that they did. Claim stays
  // offered underneath, since the token may be free again by now.
  const view =
    owner === "nobody" ? (
      <NobodyHasIt claim={claim} />
    ) : owner === "you" ? (
      <YouOwnIt claimedAt={claimedAt} release={release} />
    ) : (
      <SomeoneElseHasIt release={release} ownerId={ownerId} isAdmin={isAdmin} />
    );

  if (isApiErrorCode(failure, "token_taken")) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-destructive">Someone else already claimed this token.</p>
        {view}
      </div>
    );
  }

  return view;
}

function NobodyHasIt({ claim }: { claim: ReturnType<typeof useClaimToken> }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-base">Nobody has claimed this token yet.</p>
      {/* Disabled while the claim is in flight. Spec 4: the cap has no exemption, and two
          claims at the same instant could leave someone holding 4. */}
      <Button size="lg" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? "Claiming" : "Claim"}
      </Button>
    </div>
  );
}

function YouOwnIt({
  claimedAt,
  release,
}: {
  claimedAt: string | null;
  release: ReturnType<typeof useReleaseToken>;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-base">This is your token.</p>
        {claimedAt ? (
          <p className="text-sm text-muted-foreground">Claimed {formatWhen(claimedAt)}.</p>
        ) : null}
      </div>
      <ReleaseTokenBlock release={release} mine />
    </div>
  );
}

/**
 * Agreement 8.5's table: "someone_else" reads "This token belongs to someone else", and
 * "A GeekyKey admin also sees Release". An ordinary user gets the sentence alone.
 */
function SomeoneElseHasIt({
  release,
  ownerId,
  isAdmin,
}: {
  release: ReturnType<typeof useReleaseToken>;
  ownerId: string | null;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-base">This token belongs to someone else.</p>
      {isAdmin ? <ReleaseTokenBlock release={release} ownerId={ownerId} mine={false} /> : null}
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

/** A claim that failed for a reason with no wording of its own. Retry is the same claim again. */
function ClaimError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <ErrorState
      error={error}
      onRetry={onRetry}
      title={titleFor(error) ?? "Couldn't claim this token"}
      description={titleFor(error) ? null : undefined}
    />
  );
}

/**
 * An address that is not a token's UID is the likeliest lookup failure here, since the
 * URL is typed by hand as often as it is tapped, so it says so rather than "could not load".
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
