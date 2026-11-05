/*
  Mirrors apps/API-AGREEMENT.md field for field, in snake_case: this is the wire
  shape for the GeekyKey Service. Never add a field the agreement does not have;
  propose a change to the agreement instead.

  Sections 8.2 to 8.6 and 8.8 of the agreement are the endpoints here, and the token
  kinds screen's two, which BAC-139 builds ahead of the agreement's next version. A
  GeekyKey admin's other job is releasing someone else's token, which is 8.3 with
  `owner_id`. The Event Service's shapes (agreement 8.1, 9.x)
  are deliberately absent: they belong to apps/event-web and must not leak into
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
   * The owner's user ID. Only for a GeekyKey admin when `owner` is
   * "someone_else"; null otherwise. Passed back to release (8.3) so a late click
   * cannot release a newer claim.
   */
  owner_id: string | null;
}

export type TokenOwner = "nobody" | "you" | "someone_else";

/** One Event Service's answer to a meeting (agreement 8.8, from 11.10). */
export interface Meeting {
  /** The Event Service's id, one of the events in /me (8.4). */
  event_id: string;
  status: MeetingStatus;
}

/**
 * Every status an Event Service can answer a half with (agreement 11.10 and 8.8). One
 * array, so the union the screens switch on and the schema that reads the wire cannot
 * drift apart. `unavailable` is not the Event Service's own word: 8.8 gives it to any
 * Event Service that doesn't answer in time or answers wrongly.
 */
export const MEETING_STATUSES = [
  "waiting",
  "connected",
  "already_connected",
  "same_kind",
  "unavailable",
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** GET /api/v1/me on the GeekyKey Service (agreement 8.4). */
export interface MeResponse {
  /** No display name: the GeekyKey Service keeps no users. */
  user: {
    id: string;
    is_geekykey_admin: boolean;
    /**
     * Whether they may open the token kinds screen: a GeekyKey admin or an organizer
     * (BAC-139). A service from before it leaves it out, and has no such screen either.
     */
    can_view_token_kinds?: boolean;
  };
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

/** POST /api/v1/login-links on the GeekyKey Service (agreement 8.6). */
export interface LoginLink {
  /**
   * The event's screens, with the link in the address. The screens open it as it
   * is and never build one, so the event's address and the fragment's name belong
   * to the GeekyKey Service.
   */
  url: string;
  /** When the link stops working. It works once, for 60 seconds. */
  expires_at: string;
}

/** One token on the list of token kinds, and its kind (BAC-139). */
export interface TokenKind {
  uid: string;
  kind: string;
}

/** How many tokens on the list of token kinds have one kind (BAC-139). */
export interface TokenKindTotal {
  kind: string;
  tokens: number;
}

/** What a load of token kinds did to the list (BAC-139). */
export interface TokenKindsLoaded {
  /** Tokens that weren't on the list. */
  new: number;
  /** Tokens on the list with another kind, which now have this one. */
  changed: number;
  /** Tokens already on the list with this kind. */
  unchanged: number;
}

/**
 * Only the error codes the endpoints above can actually answer.
 *
 * The station-facing codes (missing_station_key, invalid_station_key,
 * invalid_event_service_key) and `event_service_unavailable` never reach a screen, so
 * they are not here. `claims_unavailable` is: every one of 8.2 to 8.5 answers 503 when
 * the claims stand-in, or the Portal after the switch, cannot say who owns a token in
 * time. See the status table and the note above section 8.2 in the agreement.
 *
 * `service_unavailable` is another 503 a screen can see: the Worker in front of these
 * screens answers it when the GeekyKey Service gave no answer at all (agreement section
 * 2). It is this app's own service being down, not GeeksHacking's claims.
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
  | "service_unavailable"
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
