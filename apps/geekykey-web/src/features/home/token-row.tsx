import type { Token } from "@/api/types";

import { ReleaseButton } from "@/components/release-button";
import { ReleaseError } from "@/components/release-error";
import { formatWhen } from "@/lib/format";
import { formatUid } from "@/lib/token-uid";
import { useReleaseToken } from "@/lib/use-release-token";

/**
 * One row of My tokens (agreement 8.4): the UID in the token page's own format, when
 * the claim happened, and the shared Release. A row's Release mounts its own
 * useReleaseToken, whose success invalidates the me query this list reads, so removal
 * is one refetch and the row holds no list state of its own. Releases here are always an owner's
 * own: 8.4 offers no owner_id case, which stays a token-page concern (8.3 with the
 * lookup's owner).
 *
 * The UID leads the row, with the claim time under it in the mono small print the design
 * direction gives timestamps. Release sits beside it as a compact outline button, as on
 * Token kinds' rows, so the event's button below the list stays the page's main action
 * (FRO-155). A long UID wraps between its byte pairs and pushes Release under it, rather
 * than squeezing either. A failed release shows across the whole row, under both.
 */
export function TokenRow({ token }: { token: Token }) {
  const release = useReleaseToken(token.uid);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <code className="font-mono text-base text-foreground">{formatUid(token.uid)}</code>
          {token.claimed_at ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Claimed {formatWhen(token.claimed_at)}.
            </p>
          ) : null}
        </div>
        <ReleaseButton release={release} mine compact />
      </div>
      {release.error ? (
        <div className="mt-3">
          <ReleaseError error={release.error} />
        </div>
      ) : null}
    </div>
  );
}
