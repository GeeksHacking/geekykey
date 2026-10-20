import { isApiErrorCode } from "@/api/errors";

/*
  A rate-limited poll is not a fault. The Event Service answers 429 with
  Retry-After: 60 once a caller passes 60 requests a minute (agreement section 2,
  "Rate limits"), so the honest reading is "what you see is a moment old", not
  "something broke". Every polled screen gets a quiet note instead of the red
  error state, and only a first load with no data falls back to an error.

  TanStack Query already keeps the last successful data when a background refetch
  fails (isRefetchError, not isLoadingError), so nothing here has to cache a copy
  or copy data into state. This only decides which message to draw.
*/

/** True for the agreement's rate_limited answer, whatever transport produced it. */
export function isRateLimited(error: unknown): boolean {
  return isApiErrorCode(error, "rate_limited");
}

/**
 * Whether a failed query should show the quiet stale note rather than the error
 * state. Only for a rate limit, and only when there is data still worth showing.
 */
export function showStaleNote(error: unknown, hasData: boolean): boolean {
  return hasData && isRateLimited(error);
}
