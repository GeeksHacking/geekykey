import { describeError, isApiErrorCode } from "@/api/errors";

/**
 * A failed release. 8.3's not_found means the token was already released, or claimed by
 * someone else since the page loaded, so the page's data is stale and describeError's
 * "That was not found. It may have been removed." would be wrong: the token still exists.
 */
export function ReleaseError({ error }: { error: unknown }) {
  if (isApiErrorCode(error, "not_found")) {
    return (
      <p role="alert" className="text-sm text-destructive-text">
        Someone else has claimed this token now, or it has already been released.
      </p>
    );
  }
  // forbidden, claims_unavailable and rate_limited are all things describeError already
  // words for, and section 13 fixes the wording for two of them.
  return (
    <p role="alert" className="text-sm text-destructive-text">
      {describeError(error)}
    </p>
  );
}
