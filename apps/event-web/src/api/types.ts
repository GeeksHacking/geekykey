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
  /**
   * False while `display_name` is the default, `Guest`, which neither a login nor the user
   * gave. Then the passport asks for a name (agreement 8.1, 8.7).
   */
  has_name: boolean;
  /**
   * Each question the user has answered, by ID, with the choice they picked (agreement 0.13
   * draft, 8.1). It leaves out the questions they haven't answered, so it is `{}` until they
   * answer one, and always `{}` without an answers game.
   */
  answers: Record<string, string>;
  /** What the user wrote about themselves, or null for none (BAC-147, agreement 8.1). */
  bio: string | null;
  /** How to reach the user, which only people they connect with see, or null (BAC-147). */
  contact_line: string | null;
}

export interface QuestionChoice {
  id: string;
  text: string;
}

/** One of the answers game's questions (agreement 0.13 draft, 8.1). */
export interface Question {
  id: string;
  text: string;
  choices: QuestionChoice[];
}

/**
 * One of the user's connections (agreement 0.13 draft, 8.1). It never carries the other
 * person's user ID or answers.
 */
export interface Connection {
  /**
   * The connection's own ID, for the reaction test's play (BAC-156, for the agreement's next
   * version, 8.11). Missing or null from a service before it.
   */
  id?: string | null;
  connected_at: string;
  /**
   * The other person's current name, so unlike the rest it can change after the connection. Null
   * when they have never logged in to this Event Service, which a screen shows as `Guest`
   * (BAC-136, draft for the agreement's next version).
   */
  display_name: string | null;
  /** The other person's current bio, or null for none (BAC-147). */
  bio: string | null;
  /** The other person's current contact line, or null for none (BAC-147). */
  contact_line: string | null;
  /**
   * The other person's kind, or null for none, which only a connection across groups has
   * (BAC-140, draft for the agreement's next version).
   */
  kind: string | null;
  /** A whole percent, or null when no question was answered by both. */
  match: number | null;
  /** BAC-150, approved for the next agreement version, section 8.1. Missing or null for a connection before dice. */
  dice?: { your_roll: number; their_roll: number; result: "win" | "loss" } | null;
  /** BAC-156, for the next agreement version, section 8.1. Missing or null unless the pair got the reaction test. */
  reaction?: Reaction | null;
  /** IDs of the questions both answered the same. Null until `shared_at`, then maybe empty. */
  shared: string[] | null;
  shared_at: string;
}

/**
 * Where one person stands in a reaction test (BAC-156). `played` with a time, `early` for a tap
 * before the signal, `missed` once `play_by` passed with no play, and `not_played` until then.
 */
export type ReactionPlay = "not_played" | "played" | "early" | "missed";

/**
 * A connection's reaction test, from this user's side (BAC-156, for the agreement's next version,
 * 8.1). Until `result` comes, `their_ms` is null and `their_play` says only whether they've had
 * their go, so an early tap of theirs shows as `played`.
 */
export interface Reaction {
  /** Two minutes after the connection. A person who hasn't played by then loses. */
  play_by: string;
  your_play: ReactionPlay;
  /** Milliseconds from the signal to the tap, or null without a time. */
  your_ms: number | null;
  their_play: ReactionPlay;
  their_ms: number | null;
  /** Null until both have played or `play_by` has passed. Equal times win for both. */
  result: "win" | "loss" | null;
}

/** POST /api/v1/me/connections/{id}/reaction's body (BAC-156, 8.11): a time, or a tap too soon. */
export type ReactionPlayRequest = { ms: number } | { early: true };

/**
 * A request waiting for this user to accept or decline it (BAC-149, draft for the agreement's
 * next version). `id` is the request's own, so it gives no other person's user ID.
 */
export interface ConnectionRequest {
  id: string;
  /** The current name of the person asking, or `Guest` when they have none. */
  display_name: string;
  /**
   * Their current bio, or null for none, so the user can see who's asking before accepting
   * (BAC-151, for the agreement's next version). Their contact line stays hidden until the two connect.
   */
  bio: string | null;
  requested_at: string;
}

/** What accepting a connection request answers (BAC-149). One list, for the union and the schema. */
export const ACCEPT_CONNECTION_REQUEST_STATUSES = [
  "answers_needed",
  "connected",
  "already_connected",
  "same_kind",
  "same_group",
  "no_group",
] as const;

export type AcceptConnectionRequestStatus = (typeof ACCEPT_CONNECTION_REQUEST_STATUSES)[number];

/**
 * POST /api/v1/login-links on the Event Service (agreement 8.12, BAC-157, for the next
 * version): a login link to the GeekyKey screens for the signed-in user, which works once and
 * expires 60 seconds after it is made. My tokens opens it straight away and keeps nothing.
 */
export interface GeekykeyLoginLinkResponse {
  login_link: string;
  expires_at: string;
}

/** POST /api/v1/me/connections/{id}/reaction's answer (BAC-156, 8.11): the test from this user's side. */
export interface PlayReactionResponse {
  reaction: Reaction;
}

export interface AcceptConnectionRequestResponse {
  status: AcceptConnectionRequestStatus;
}

/** One entry per station with passport settings. `earned_at` is null until the user has an accepted tap there. */
export interface Stamp {
  station_id: string;
  name: string;
  location: string | null;
  points: number;
  /** The group's page from the station's settings (agreement 8.1), or null. */
  link: string | null;
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

/**
 * PATCH /api/v1/me (agreement 8.7). Every field is optional, and a request needs at least
 * one. `display_name` is trimmed, then 1 to 30 code points; `answers` maps question IDs to
 * choice IDs and sets only the answers it names; `bio` and `contact_line` are trimmed, then at
 * most 160 and 80 code points, and blank or null clears one (BAC-147).
 */
export interface UpdateMeRequest {
  display_name?: string;
  answers?: Record<string, string>;
  bio?: string | null;
  contact_line?: string | null;
}

/** Agreement 8.7 answers with the `user` object from 8.1. */
export interface UpdateMeResponse {
  user: User;
}

/** GET /api/v1/me */
export interface MeResponse {
  user: User;
  /** The answers game's questions in the order to ask them, or null without the game. */
  questions: Question[] | null;
  points: number;
  stamps: Stamp[];
  recent_taps: MeTap[];
  /** Newest first. Empty without a connections game (BAC-149). */
  connection_requests: ConnectionRequest[];
  /** The user's connections, newest first. Empty without a connections game. */
  connections: Connection[];
}

export interface EventStationPassport {
  name: string;
  location: string | null;
  points: number;
  /** The group's page the passport offers after a stamp here (agreement 9.1), or null. */
  link: string | null;
  added_at: string;
}

/**
 * PUT /api/v1/admin/stations/{id}/passport. `location`, `points` and `link` may be left
 * out; a missing `link` clears it, as 9.1 says.
 */
export interface SetStationPassportRequest {
  name: string;
  location?: string;
  points?: number;
  link?: string;
}

/** Agreement 9.1. `station_id` is at the top level here, unlike the board's nested passport. */
export interface SetStationPassportResponse {
  passport: EventStationPassport & { station_id: string };
}

/**
 * GET /api/v1/admin/stations on the Event Service (agreement 9.2): every station this
 * Event Service has registered, enabled or disabled, with its game, its booth, its health
 * and passport settings. Version 0.3 dropped `status_known` and `linked`, because there is
 * no status call to fail and a station always feeds the Event Service that registered it.
 * Version 0.7 moved the booth onto the station (BAC-89) and gave it the game it runs
 * (BAC-90).
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
  /** The `id` of the game it runs, or null for none. With none, its taps get `no_game`. */
  game: string | null;
  /** True once a game has counted or held back a tap there, so its game can't change (9.11). */
  game_fixed: boolean;
  /** The booth the map draws it at (9.12), or null. */
  booth: string | null;
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

/**
 * 9.9 disabling and enabling a station answer the same shape, so one name covers both.
 * The station comes back as the board lists it, with `disabled_at` set on a disable
 * and cleared again on an enable. No key is in this answer.
 */
export interface StationResponse {
  station: EventStationBoardStation;
}

/**
 * PUT /api/v1/admin/stations/{id}/booth (agreement 9.12). The booth is free text the map
 * matches to a booth in its own floor plan, and a blank one clears it. It is set on any
 * station, whatever game it runs and however many taps it has.
 */
export interface SetStationBoothRequest {
  booth: string;
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

/** One station on the map (agreement 9.10). Counts only, never a user, a name or a token. */
export interface MapStation {
  station_id: string;
  /** The `id` of the game it runs, or null (9.2). */
  game: string | null;
  /** Its name in the passport while it is a stamp slot, or null. */
  name: string | null;
  /** Free text the floor plan matches to one of its booths, or null (9.12). */
  booth: string | null;
  disabled: boolean;
  /** Its `accepted` and `cooldown` taps. The map pulses a station when this goes up. */
  taps: number;
  unique_participants: number;
  last_tap_at: string | null;
}

/**
 * The event's connections, anonymous (agreement 9.10). `count` is how many the event has.
 * `links` gives each one as two guest numbers, the smaller first, oldest connection first.
 * The numbers stand for users, numbered in the order they first connected, and none of them
 * carries a name or a user ID.
 */
export interface MapConnections {
  count: number;
  links: [number, number][];
}

/** GET /api/v1/map: every station, stamp slots first in slot order, then the others oldest first. */
export interface MapResponse {
  stations: MapStation[];
  /** Absent before the Event Service that answers has connections (9.10). */
  connections?: MapConnections;
}

/** How someone came to be in their group (spec: participant groups, draft for agreement 0.14). */
export type GroupPlacedHow = "allocated" | "latecomer" | "organizer";

/**
 * Another group as a participant's card lists it (BAC-167, draft for the agreement's next
 * version): by name only, and whether the participant's group has reached it, which it has once
 * one of its members has a connection with one of that group's.
 */
export interface OtherGroup {
  name: string;
  reached: boolean;
}

/** A participant's own group. Its members are names only, never a user ID. */
export interface MyGroup {
  id: string;
  name: string;
  tags: string[];
  location: string | null;
  members: { display_name: string }[];
  /** Every other group, oldest first (BAC-167). An Event Service from before it leaves it out. */
  other_groups?: OtherGroup[];
}

/** GET and POST /api/v1/me/group (draft for agreement 0.14). `group` is set only when `placed`. */
export interface MyGroupResponse {
  status: "not_joined" | "waiting" | "placed";
  allocation_started: boolean;
  group: MyGroup | null;
}

export interface EventGroupMember {
  user_id: string;
  display_name: string;
  joined_at: string;
  placed_at: string;
  how: GroupPlacedHow;
}

/** A group as the organizers' board lists it, and as creating one answers. */
export interface EventGroup {
  id: string;
  name: string;
  tags: string[];
  location: string | null;
  capacity: number | null;
  members: EventGroupMember[];
  /**
   * The other groups this one has reached, in the board's order (BAC-167, draft for the
   * agreement's next version). An Event Service from before it leaves it out.
   */
  reached_group_ids?: string[];
}

export interface GroupWaitingMember {
  user_id: string;
  display_name: string;
  joined_at: string;
}

/**
 * Who may connect (BAC-140, draft for the agreement's next version): two people of different
 * token kinds, which a new event starts on, or two people in different groups.
 */
export const CONNECT_ACROSS = ["token_kinds", "groups"] as const;

export type ConnectAcross = (typeof CONNECT_ACROSS)[number];

/** PUT /api/v1/admin/connections/rule, its request and its answer (BAC-140). */
export interface ConnectionRule {
  connect_across: ConnectAcross;
}

/**
 * Which challenge a new connection plays (BAC-161, draft for the agreement's next version): the
 * dice or the reaction test at random, which a new event starts on, or always one of them.
 */
export const CHALLENGES = ["random", "dice", "reaction"] as const;

export type Challenge = (typeof CHALLENGES)[number];

/** PUT /api/v1/admin/connections/challenge, its request and its answer (BAC-161). */
export interface ConnectionChallenge {
  challenge: Challenge;
}

/** GET /api/v1/admin/groups and POST /api/v1/admin/groups/allocate (draft for agreement 0.14). */
export interface GroupBoardResponse {
  allocation_started_at: string | null;
  /** What connections need now, which the Groups screen's switch sets (BAC-140). */
  connect_across: ConnectAcross;
  /**
   * What a new connection plays now, which the Groups screen's choice sets (BAC-161). An Event
   * Service from before it leaves it out, and the screen then doesn't offer the choice.
   */
  challenge?: Challenge;
  joined_count: number;
  groups: EventGroup[];
  waiting: GroupWaitingMember[];
}

/**
 * POST /api/v1/admin/groups, and PUT /api/v1/admin/groups/{id}, which sets every field. A field
 * left out is none: no tags, no location, and room for any number. At most 5 tags.
 */
export interface CreateGroupRequest {
  name: string;
  tags?: string[];
  location?: string | null;
  capacity?: number | null;
}

export type UpdateGroupRequest = CreateGroupRequest;

/**
 * POST /api/v1/admin/groups/split (BAC-138, BAC-141, BAC-146, draft for agreement 0.14): takes
 * exactly one of two numbers. By `people_per_group` (2 or more), which is each group's capacity,
 * it works out the number of groups from who has joined. By `group_count` (1 or more), the groups
 * have no capacity. It makes "Group 1", "Group 2" and so on, then allocates everyone. Group n's
 * location is the nth of `locations`, a missing or blank one is none, and any past the last group
 * is ignored.
 */
export type SplitGroupsRequest = {
  locations?: (string | null)[];
} & (
  | { people_per_group: number; group_count?: never }
  | { group_count: number; people_per_group?: never }
);

export type ErrorCode =
  | "validation_failed"
  | "unauthenticated"
  // Agreement 0.4 section 7.2: POST /auth/firebase, on both services.
  | "invalid_token"
  // Agreement 0.5 section 7.4: POST /auth/login-link, on the Event Service.
  | "invalid_login_link"
  | "missing_station_key"
  | "invalid_station_key"
  | "forbidden"
  | "not_found"
  // Agreement 0.13 section 8.7: the user's first connection fixed their answers.
  | "answers_fixed"
  // Drafts for agreement 0.14: another group has this name; Allocate with no groups, or with
  // fewer than 2 joined for each group, which also gives how many more it `needed`; the
  // one-step split while any group exists.
  | "name_taken"
  | "no_groups"
  | "too_few_participants"
  | "groups_exist"
  // BAC-156, for the agreement's next version, 8.11: a second play of a reaction test, and one
  // after its 2 minutes.
  | "already_played"
  | "too_late"
  | "rate_limited"
  | "invalid_event_service_key"
  | "event_service_unavailable"
  | "claims_unavailable"
  | "login_unavailable"
  // Agreement section 2: the Worker in front of a set of screens answers this when the
  // service behind it gave no answer at all.
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

/**
 * CSV columns of GET /api/v1/admin/groups/export.csv, in order (draft for agreement 0.14).
 * `group_name`, `placed_at` and `how` are empty for someone still waiting.
 */
export const GROUPS_EXPORT_CSV_COLUMNS = [
  "user_id",
  "display_name",
  "group_name",
  "joined_at",
  "placed_at",
  "how",
] as const;
