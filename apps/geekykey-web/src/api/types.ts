/*
  Mirrors apps/API-AGREEMENT.md field for field, in snake_case: this is the wire
  shape for the GeekyKey Service. Never add a field the agreement does not have;
  propose a change to the agreement instead.

  Sections 8.2 to 8.5 of the agreement are the endpoints here. Section 10 has been
  empty since version 0.3: a GeekyKey admin's one job is releasing someone else's token,
  which is 8.3 with `owner_id`. The Event Service's shapes (agreement 8.1, 9.x)
  are deliberately absent: they belong to apps/frontend and must not leak into
  these screens.
*/

/** One token as the GeekyKey Service returns it (agreement 8.2, 8.4, 8.5). */
export interface Token {
  uid: string;
  claimed_at: string | null;
}

/** The token page's view of a token (agreement 8.5). */
export interface TokenLookup {
  uid: string;
  owner: TokenOwner;
  /** When you claimed it, only when `owner` is "you". Otherwise null. */
  claimed_at: string | null;
  /**
   * The owner's Portal user ID. Only for a GeekyKey admin when `owner` is
   * "someone_else"; null otherwise. Passed back to release (8.3) so a late click
   * cannot release a newer claim.
   */
  owner_id: string | null;
}

export type TokenOwner = "nobody" | "you" | "someone_else";

/** GET /api/v1/me on the GeekyKey Service (agreement 8.4). */
export interface MeResponse {
  /** No display name: the GeekyKey Service keeps no users. */
  user: { id: string; is_geekykey_admin: boolean };
  /** The user's tokens, oldest claim first. */
  tokens: Token[];
  /** Each Event Service with a public address, for links such as "Open Capstone Showcase". */
  events: EventServiceLink[];
}

export interface EventServiceLink {
  id: string;
  name: string;
  url: string;
}

/**
 * Only the error codes the endpoints above can actually answer.
 *
 * The station-facing codes (missing_station_key, invalid_station_key,
 * invalid_event_service_key) and `event_service_unavailable` never reach a screen, so
 * they are not here. `claims_unavailable` is: every one of 8.2 to 8.5 answers 503 when
 * the claims stand-in, or the Portal after the switch, cannot say who owns a token in
 * time. See the status table and the note above section 8.2 in the agreement.
 */
export type ErrorCode =
  | "validation_failed"
  | "unauthenticated"
  // Agreement 0.4 section 7.2: POST /auth/firebase, on both services.
  | "invalid_token"
  | "forbidden"
  | "not_found"
  | "token_taken"
  | "token_limit_reached"
  | "rate_limited"
  | "claims_unavailable"
  | "login_unavailable"
  | "internal_error";

export interface ApiIssue {
  path: (string | number)[];
  message: string;
}

/** Every non-2xx body. */
export interface ErrorBody {
  error: ErrorCode;
  issues?: ApiIssue[];
}
