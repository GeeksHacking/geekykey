/*
  Mirrors apps/API-AGREEMENT.md field for field, in snake_case: this is the wire
  shape for the GeekyKey Service. Never add a field the agreement does not have;
  propose a change to the agreement instead.

  Sections 8.2 to 8.5 and 10 of the agreement are the endpoints here. The Event
  Service's shapes (agreement 8.1, 9.x) are deliberately absent: they belong to
  apps/frontend and must not leak into these screens.
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

/** The event a station feeds, and since when (agreement 10). `event_service_name` is null when it left the settings. */
export interface StationLink {
  event_service_id: string;
  event_service_name: string | null;
  linked_at: string;
}

/**
 * The station object every section 10 endpoint answers with. This is the GeekyKey
 * Service's registry, not the Event Service's board (agreement 9.2), which has a
 * different shape for the same path.
 */
export interface Station {
  id: string;
  /** The device's own name, such as "Reader 3". */
  label: string;
  created_at: string;
  link: StationLink | null;
  disabled_at: string | null;
  last_seen_at: string | null;
  online: boolean;
  /** From the station's last heartbeat, or null. */
  firmware_version: string | null;
  buffered_taps: number | null;
  reader_ok: boolean | null;
}

/** GET /api/v1/admin/stations on the GeekyKey Service (agreement 10.1). */
export interface ListStationsResponse {
  stations: Station[];
  /** The Event Services a station can be linked to. */
  event_services: { id: string; name: string }[];
}

/** POST /api/v1/admin/stations (agreement 10.2). */
export interface CreateStationRequest {
  label: string;
}

/** `api_key` is returned only here, once. There is no endpoint to read it back. */
export interface CreateStationResponse {
  station: Station;
  api_key: string;
}

/** POST /api/v1/admin/stations/{id}/key (agreement 10.3). `api_key` is returned only here. */
export interface ReplaceStationKeyResponse {
  station: Station;
  api_key: string;
}

/** PUT /api/v1/admin/stations/{id}/link (agreement 10.4). `null` unlinks. */
export interface SetStationLinkRequest {
  event_service_id: string | null;
}

/**
 * Only the error codes the endpoints above can actually answer. The station-facing
 * codes (missing_station_key, invalid_station_key, invalid_event_service_key) and
 * the service-outage codes never reach a screen, so they are not here; see
 * "Error codes" in the agreement's status table.
 */
export type ErrorCode =
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "token_taken"
  | "token_limit_reached"
  | "rate_limited"
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
