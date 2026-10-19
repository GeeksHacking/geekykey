import type { Token } from "@/api/types";

import { ReleaseTokenBlock } from "@/components/release-token-block";
import { useReleaseToken } from "@/features/token/use-release-token";
import { formatWhen } from "@/lib/format";
import { formatUid } from "@/lib/token-uid";

/**
 * One row of My tokens (agreement 8.4): the UID in the token page's own format, when
 * the claim happened, and the shared Release. A row mounts its own useReleaseToken,
 * whose success invalidates the me query this list reads, so removal is one refetch
 * and the row holds no list state of its own. Releases here are always an owner's
 * own: 8.4 offers no owner_id case, which stays a token-page concern (8.3 with the
 * lookup's owner).
 */
export function TokenRow({ token }: { token: Token }) {
  const release = useReleaseToken(token.uid);

  return (
    <div className="rounded-lg border p-4">
      <code className="font-mono text-foreground">{formatUid(token.uid)}</code>
      {token.claimed_at ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Claimed {formatWhen(token.claimed_at)}.
        </p>
      ) : null}
      <div className="mt-3">
        <ReleaseTokenBlock release={release} mine />
      </div>
    </div>
  );
}
