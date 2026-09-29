/*
  Mirrors apps/API-AGREEMENT.md field for field. snake_case on purpose: this is
  the wire shape. Never add a field the agreement does not have; propose a
  change to the agreement instead.
*/

export type Role = "participant" | "organizer";

/** Stored tap statuses. `duplicate` exists in the agreement but is only ever returned to stations. */
export type TapStatus = "accepted" | "cooldown" | "unknown_token";

export type TapSource = "nfc" | "qr_fallback";

export interface User {
  id: string;
  display_name: string;
  role: Role;
}

export interface Token {
  uid: string;
  paired_at: string;
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
  tokens: Token[];
  points: number;
  stamps: Stamp[];
  recent_taps: MeTap[];
}

/** POST /api/v1/tokens/pair */
export interface PairTokenRequest {
  uid: string;
}

export interface PairTokenResponse {
  token: Token;
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
  /** null for unknown_token taps. */
  user: { id: string; display_name: string } | null;
  /** null when a QR user_id fallback has no active NFC token. */
  token_uid: string | null;
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

/** POST /api/v1/admin/taps. Exactly one of user_id or uid. */
export type FallbackTapRequest =
  | { station_id: string; user_id: string }
  | { station_id: string; uid: string };

export interface FallbackTapResponse {
  result: { id: number; status: TapStatus };
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
  | "uid_already_paired"
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

/** CSV columns of GET /api/v1/admin/export.csv, in order. */
export const EXPORT_CSV_COLUMNS = [
  "tap_id",
  "client_tap_id",
  "station_id",
  "station_name",
  "user_id",
  "display_name",
  "token_uid",
  "status",
  "source",
  "tapped_at",
  "received_at",
] as const;
