import { Link } from "@tanstack/react-router";

import { describeError, isApiErrorCode } from "@/api/errors";
import { EventButtons } from "@/components/event-buttons";
import { DataSourceNotice } from "@/components/layout/data-source-notice";
import { ErrorState } from "@/components/layout/error-state";
import { ReleaseTokenBlock } from "@/components/release-token-block";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWhen } from "@/lib/format";
import { formatUid } from "@/lib/token-uid";
import { HOME_PATH } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { useClaimToken } from "@/lib/use-claim-token";
import { useReleaseToken } from "@/lib/use-release-token";
import type { EventServiceLink, TokenLookup } from "@/api/types";
import { MeetingError } from "@/features/token/meeting-error";
import { MeetingNotice } from "@/features/token/meeting-notice";
import { OwnerSentences } from "@/features/token/owner-sentences";
import { useMeeting } from "@/features/token/use-meeting";
import { useToken } from "@/features/token/use-token";

/**
 * The token page, `/t/<UID>` (agreement 8.5), with Claim (8.2) and Release (8.3). Someone
 * taps a token with a phone, so this is mobile first: one question answered, nothing to
 * scroll past.
 *
 * What it shows is decided by `owner`: "nobody" for an unclaimed token, which gets Claim,
 * "you" for your own with when you claimed it and a Release, and "someone_else" with whose
 * it is and what the tap came to, unless the signed-in user is a GeekyKey admin, who gets the
 * plain sentence and a Release. The lookup never names the owner: 8.5 gives `owner_id` only to a GeekyKey admin,
 * and the mock enforces that. The only name and bio here come from the half's answer (8.8).
 *
 * Your own token carries a button for each event in /me as well, which opens that
 * event's screens as the same user through a login link (8.6). A token someone else holds
 * also sends the half of a connection (8.8) and says what the event answered.
 */
export function TokenPage({ uid }: { uid: string }) {
  const query = useToken(uid);
  const claim = useClaimToken();
  const release = useReleaseToken(uid);
  const { me } = useSession();
  const displayed = formatUid(uid);

  return (
    <main className="flex flex-col px-1 py-4">
      {/* Only your own is "your token" (8.5). The same page answers a tap on someone else's. */}
      <h1 className="type-title">{query.data?.owner === "you" ? "Your token" : "Token"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <code className="font-mono text-foreground">{displayed}</code>
      </p>

      <DataSourceNotice />

      <div className="mt-8" aria-live="polite">
        {/* The page needs /me as much as the token: an admin's page must never send a
            half (8.8), so nothing here renders before the session says who the user is.
            In the app RequireSession has loaded it before this page; this branch covers a
            page mounted without that gate. */}
        {query.isPending || me === null ? (
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
            isAdmin={me.user.is_geekykey_admin}
            events={me.events}
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
  events,
}: {
  lookup: TokenLookup;
  claim: ReturnType<typeof useClaimToken>;
  release: ReturnType<typeof useReleaseToken>;
  isAdmin: boolean;
  events: EventServiceLink[];
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
    return <ClaimError error={failure} onRetry={() => claim.mutate(lookup.uid)} />;
  }

  // Agreement 13: on token_taken the sentence sits above whatever a fresh lookup answers,
  // including nobody, so a user who lost the claim still learns that they did. Claim stays
  // offered underneath, since the token may be free again by now.
  const view =
    owner === "nobody" ? (
      <NobodyHasIt claim={claim} uid={lookup.uid} />
    ) : owner === "you" ? (
      <YouOwnIt claimedAt={claimedAt} release={release} events={events} uid={lookup.uid} />
    ) : (
      <SomeoneElseHasIt
        release={release}
        ownerId={ownerId}
        isAdmin={isAdmin}
        events={events}
        uid={lookup.uid}
      />
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

function NobodyHasIt({ claim, uid }: { claim: ReturnType<typeof useClaimToken>; uid: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-base">Nobody has claimed this token yet.</p>
      {/* Disabled while the claim is in flight. Spec 4: the cap has no exemption, and two
          claims at the same instant could leave someone holding 4. */}
      <Button size="lg" disabled={claim.isPending} onClick={() => claim.mutate(uid)}>
        {claim.isPending ? "Claiming" : "Claim"}
      </Button>
    </div>
  );
}

/**
 * Your own token: when you claimed it, the Release, and a button for each event in /me.
 * Agreement 8.5's table puts those side by side, and the button opens that event's
 * screens as the same user through a login link (8.6). The page names its token, so
 * the link carries the token's kind (11.9).
 */
function YouOwnIt({
  claimedAt,
  release,
  events,
  uid,
}: {
  claimedAt: string | null;
  release: ReturnType<typeof useReleaseToken>;
  events: EventServiceLink[];
  uid: string;
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
      <EventButtons events={events} uid={uid} />
    </div>
  );
}

/**
 * Agreement 8.5's table: "someone_else" reads "This token belongs to someone else", and
 * "A GeekyKey admin also sees Release". An ordinary user gets the sentence, with the owner's
 * name and bio once the half (8.8) answers them, and under it what the half answered. An admin gets
 * Release instead: they may be holding a lost token, so their arrival is not a tap between two
 * people, and the page sends no half.
 */
function SomeoneElseHasIt({
  release,
  ownerId,
  isAdmin,
  events,
  uid,
}: {
  release: ReturnType<typeof useReleaseToken>;
  ownerId: string | null;
  isAdmin: boolean;
  events: EventServiceLink[];
  uid: string;
}) {
  // 8.8: no button. The page sends the half by itself, and skips it for an admin.
  const meeting = useMeeting(uid, !isAdmin);
  // One Event Service's answer, so a bio never sits under a name another event gave.
  const ownerAnswer =
    meeting.data?.find((item) => item.owner_name !== null) ??
    meeting.data?.find((item) => item.owner_bio !== null);

  return (
    <div className="flex flex-col items-start gap-4">
      <OwnerSentences name={ownerAnswer?.owner_name ?? null} bio={ownerAnswer?.owner_bio ?? null} />
      {isAdmin ? (
        <ReleaseTokenBlock release={release} ownerId={ownerId} mine={false} />
      ) : (
        <>
          {/* The page sends the half by itself, so without this the answer appears from nothing. */}
          {meeting.isPending ? (
            <div role="status" className="w-full">
              <Skeleton className="h-14 w-full rounded-lg" />
              <span className="sr-only">Loading</span>
            </div>
          ) : null}
          <MeetingNotice meetings={meeting.data ?? []} events={events} uid={uid} />
          <MeetingError error={meeting.error} />
        </>
      )}
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
