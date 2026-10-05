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

/** One entry per station. `earned_at` is null until the user has an accepted tap there. */
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
  station_name: string;
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

export interface Station {
  id: string;
  name: string;
  location: string | null;
  points: number;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
}

export interface EventStationPassport {
  name: string;
  location: string | null;
  points: number;
  added_at: string;
}

export interface EventStationBoardStation {
  id: string;
  label: string | null;
  linked: boolean | null;
  passport: EventStationPassport | null;
  last_seen_at: string | null;
  online: boolean | null;
  firmware_version: string | null;
  buffered_taps: number | null;
  reader_ok: boolean | null;
  last_tap_at: string | null;
}

export interface EventStationBoardResponse {
  status_known: boolean;
  stations: EventStationBoardStation[];
}

/** POST /api/v1/admin/stations */
export interface CreateStationRequest {
  name: string;
  location?: string;
  points?: number;
}

/** `api_key` is returned only here, once. */
export interface CreateStationResponse {
  station: Station;
  api_key: string;
}

/** GET /api/v1/admin/stations */
export interface ListStationsResponse {
  stations: Station[];
}

export interface AdminTap {
  id: number;
  client_tap_id: string;
  station: { id: string; name: string };
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

/** POST /api/v1/admin/taps. The organiser supplies the Portal user ID. */
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
  | "missing_station_key"
  | "invalid_station_key"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "invalid_event_service_key"
  | "event_service_unavailable"
  | "portal_unavailable"
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
