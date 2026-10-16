/*
  Mirrors apps/API-AGREEMENT.md field for field. snake_case on purpose: this is
  the wire shape. Never add a field the agreement does not have; propose a
  change to the agreement instead.
*/

export type Role = "participant" | "organizer";

/** Stored tap statuses. `duplicate` is station-only and is not part of the admin/Event log. */
export type TapStatus = "accepted" | "cooldown" | "no_game";

export type TapSource = "nfc" | "qr_fallback";

export interface User {
  id: string;
  display_name: string | null;
  role: Role;
}

/** One entry per station with passport settings. `earned_at` is null until the user has an accepted tap there. */
export interface Stamp {
  station_id: string;
  name: string;
  location: string | null;
  points: number;
  earned_at: string | null;
}

export interface MeTap {
  id: number;
  station_id: string;
  /** Null for a station without passport settings. */
  station_name: string | null;
  status: TapStatus;
  source: TapSource;
  tapped_at: string | null;
  received_at: string;
}

/** GET /api/v1/me */
export interface MeResponse {
  user: User;
  points: number;
  stamps: Stamp[];
  recent_taps: MeTap[];
}

export interface EventStationPassport {
  name: string;
  location: string | null;
  points: number;
  added_at: string;
}

/** PUT /api/v1/admin/stations/{id}/passport. `location` and `points` may be left out. */
export interface SetStationPassportRequest {
  name: string;
  location?: string;
  points?: number;
}

/** Agreement 9.1. `station_id` is at the top level here, unlike the board's nested passport. */
export interface SetStationPassportResponse {
  passport: EventStationPassport & { station_id: string };
}

/**
 * GET /api/v1/admin/stations on the Event Service (agreement 9.2): every station this
 * Event Service has registered, enabled or disabled, with its health and passport
 * settings. Version 0.3 dropped `status_known` and `linked`, because there is no
 * status call to fail and a station always feeds the Event Service that registered it.
 *
 * `label` and `online` are always present. `last_seen_at` is set by every hand-off, so
 * a station created by 9.7 and not yet heard from has none and reads as offline. The
 * three heartbeat fields stay null until a heartbeat's hand-off reports them.
 */
export interface EventStationBoardStation {
  id: string;
  label: string;
  created_at: string;
  disabled_at: string | null;
  passport: EventStationPassport | null;
  last_seen_at: string | null;
  online: boolean;
  firmware_version: string | null;
  buffered_taps: number | null;
  reader_ok: boolean | null;
  last_tap_at: string | null;
}

export interface EventStationBoardResponse {
  stations: EventStationBoardStation[];
}

/** POST /api/v1/admin/stations (agreement 9.7). The label is the device's name. */
export interface CreateStationRequest {
  label: string;
}

/**
 * 9.7 creating a station and 9.8 replacing its key answer the same shape, so one name
 * covers both. The station comes back as the board lists it. `api_key` is returned only
 * in the response that issued it, once, and there is no endpoint to read it back.
 */
export interface StationKeyResponse {
  station: EventStationBoardStation;
  api_key: string;
}

export interface AdminTap {
  id: number;
  client_tap_id: string;
  station: { id: string; name: string | null };
  /** Every stored Event tap has a user. */
  user: { id: string; display_name: string | null };
  status: TapStatus;
  source: TapSource;
  tapped_at: string | null;
  received_at: string;
}

/** GET /api/v1/admin/taps query parameters */
export interface ListTapsQuery {
  limit?: number;
  before_id?: number;
  station_id?: string;
  status?: TapStatus;
}

export interface ListTapsResponse {
  taps: AdminTap[];
  next_before_id: number | null;
}

/** POST /api/v1/admin/taps. The organiser supplies the user ID. */
export interface FallbackTapRequest {
  station_id: string;
  user_id: string;
}

export type FallbackTapStatus = "accepted" | "cooldown";

export interface FallbackTapResponse {
  result: { id: number; status: FallbackTapStatus };
}

/** GET /api/v1/admin/stats */
export interface StatsResponse {
  total_taps: number;
  accepted_taps: number;
  unique_participants: number;
  stations: StationStats[];
}

export interface StationStats {
  station_id: string;
  name: string;
  accepted_taps: number;
  unique_participants: number;
}

/** POST /auth/dev-login */
export interface DevLoginRequest {
  user_id: string;
}

export type ErrorCode =
  | "validation_failed"
  | "unauthenticated"
  // Agreement 0.4 section 7.2: POST /auth/firebase, on both services.
  | "invalid_token"
  | "missing_station_key"
  | "invalid_station_key"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "invalid_event_service_key"
  | "event_service_unavailable"
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

/** CSV columns of GET /api/v1/admin/export.csv, in order. Agreement 9.6. */
export const EXPORT_CSV_COLUMNS = [
  "tap_id",
  "client_tap_id",
  "station_id",
  "station_name",
  "user_id",
  "display_name",
  "status",
  "source",
  "tapped_at",
  "received_at",
] as const;
