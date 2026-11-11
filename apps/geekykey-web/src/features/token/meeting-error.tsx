import { describeError, isApiErrorCode } from "@/api/errors";

/**
 * A half that came back with an error rather than an answer. Section 13 words two of
 * them for the token page, and describeError already carries both. A lost session is on
 * its way to /login, and not_found has sent the page back to its lookup, so neither has
 * anything to add here.
 *
 * Nothing offers a retry: 11.10 says tapping the token again sends the half again, which
 * does no harm, so the token is the only button this needs.
 */
export function MeetingError({ error }: { error: unknown }) {
  if (!error) return null;
  if (isApiErrorCode(error, "unauthenticated")) return null;
  if (isApiErrorCode(error, "not_found")) return null;

  return (
    <p role="alert" className="text-sm text-destructive-text">
      {describeError(error)}
    </p>
  );
}
