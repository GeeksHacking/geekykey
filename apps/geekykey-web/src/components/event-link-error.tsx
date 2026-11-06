import { describeError, isApiErrorCode } from "@/api/errors";

/**
 * What went wrong with one login-link request. Section 13 fixes the sentence for
 * rate_limited, and describeError already gives it, so the rest of the failures are
 * worded the same way, apart from the two that need no sentence.
 */
export function EventLinkError({ error }: { error: unknown }) {
  // A signed-out user is on their way to the login, as on any screen, so there is
  // nothing to say here.
  if (isApiErrorCode(error, "unauthenticated")) return null;

  // 8.6 answers not_found for an event_id that isn't in /me's events. The hook asks
  // /me again, and the fresh events decide which buttons there are. Section 13 sets
  // no sentence for it, so there is nothing to say.
  if (isApiErrorCode(error, "not_found")) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {describeError(error)}
    </p>
  );
}
