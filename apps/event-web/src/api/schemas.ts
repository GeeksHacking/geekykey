import * as z from "zod/mini";

import { NetworkError } from "@/api/errors";
import { ACCEPT_CONNECTION_REQUEST_STATUSES, CHALLENGES, CONNECT_ACROSS } from "@/api/types";
import type {
  AcceptConnectionRequestResponse,
  ConnectionChallenge,
  ConnectionRule,
  EventGroup,
  EventStationBoardResponse,
  FallbackTapResponse,
  GeekykeyLoginLinkResponse,
  GroupBoardResponse,
  ListTapsResponse,
  MapResponse,
  MeResponse,
  MyGroupResponse,
  PlayReactionResponse,
  SetStationPassportResponse,
  StationKeyResponse,
  StationResponse,
  StatsResponse,
  UpdateMeResponse,
} from "@/api/types";

/*
  The response schemas below are exported for the Event Service's route tests, which import
  this file by path and parse their answers with them
  (apps/event-service/src/test-helpers.ts). TypeScript cannot see that caller, so a
  dead-export sweep must leave those alone.
*/

const isoTimestamp = z.iso.datetime({ offset: true });
const role = z.enum(["participant", "organizer"]);
const tapStatus = z.enum(["accepted", "cooldown", "no_game"]);
const tapSource = z.enum(["nfc", "qr_fallback"]);

const userSchema = z.object({
  id: z.string(),
  display_name: z.nullable(z.string()),
  role,
  has_name: z.boolean(),
  answers: z.record(z.string(), z.string()),
  // BAC-147. A missing value reads as none, so the screens work with a service from before it.
  bio: z.prefault(z.nullable(z.string()), null),
  contact_line: z.prefault(z.nullable(z.string()), null),
});

const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  choices: z.array(z.object({ id: z.string(), text: z.string() })),
});

const reactionPlay = z.enum(["not_played", "played", "early", "missed"]);
const reactionMs = z.nullable(z.int().check(z.gte(1), z.lte(120_000)));

// BAC-156, for the next agreement version, sections 8.1 and 8.11.
const reactionSchema = z.object({
  play_by: isoTimestamp,
  your_play: reactionPlay,
  your_ms: reactionMs,
  their_play: reactionPlay,
  their_ms: reactionMs,
  result: z.nullable(z.enum(["win", "loss"])),
});

const connectionSchema = z.object({
  // BAC-156. A previous service sends no ID, and its connections have no reaction test to play.
  id: z.prefault(z.nullable(z.string()), null),
  connected_at: isoTimestamp,
  // BAC-136. A missing name reads as none, so the screens work with a service from before it.
  display_name: z.prefault(z.nullable(z.string()), null),
  bio: z.prefault(z.nullable(z.string()), null),
  contact_line: z.prefault(z.nullable(z.string()), null),
  kind: z.nullable(z.string()),
  match: z.nullable(z.int().check(z.gte(0), z.lte(100))),
  // BAC-150, approved for the next agreement version, section 8.1. A previous service sends no dice.
  dice: z.prefault(
    z.nullable(
      z.object({
        your_roll: z.int().check(z.gte(1), z.lte(6)),
        their_roll: z.int().check(z.gte(1), z.lte(6)),
        result: z.enum(["win", "loss"]),
      }),
    ),
    null,
  ),
  reaction: z.prefault(z.nullable(reactionSchema), null),
  // BAC-169, draft for the agreement's next version. Missing with no phrase to see.
  word: z.optional(z.nullable(z.object({ text: z.string(), already_had: z.boolean() }))),
  shared: z.nullable(z.array(z.string())),
  shared_at: isoTimestamp,
});

const connectionRequestSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  // BAC-151. A missing bio reads as none, so the screens work with a service from before it.
  bio: z.prefault(z.nullable(z.string()), null),
  requested_at: isoTimestamp,
});

const stampSchema = z.object({
  station_id: z.string(),
  name: z.string(),
  location: z.nullable(z.string()),
  points: z.int().check(z.nonnegative()),
  link: z.nullable(z.string()),
  earned_at: z.nullable(isoTimestamp),
});

const meTapSchema = z.object({
  id: z.int(),
  station_id: z.string(),
  station_name: z.nullable(z.string()),
  status: tapStatus,
  source: tapSource,
  tapped_at: z.nullable(isoTimestamp),
  received_at: isoTimestamp,
});

const eventPassportSchema = z.object({
  name: z.string(),
  location: z.nullable(z.string()),
  points: z.int().check(z.nonnegative()),
  link: z.nullable(z.string()),
  added_at: isoTimestamp,
});

const eventStationBoardStationSchema = z.object({
  id: z.string(),
  label: z.string(),
  created_at: isoTimestamp,
  disabled_at: z.nullable(isoTimestamp),
  game: z.nullable(z.string()),
  game_fixed: z.boolean(),
  booth: z.nullable(z.string()),
  passport: z.nullable(eventPassportSchema),
  last_seen_at: z.nullable(isoTimestamp),
  online: z.boolean(),
  firmware_version: z.nullable(z.string()),
  buffered_taps: z.nullable(z.int().check(z.nonnegative())),
  reader_ok: z.nullable(z.boolean()),
  last_tap_at: z.nullable(isoTimestamp),
});

export const eventStationBoardResponseSchema: z.ZodMiniType<EventStationBoardResponse> = z.object({
  stations: z.array(eventStationBoardStationSchema),
});

/** Agreement 9.1. Here `station_id` sits inside `passport`, which the board's doesn't have. */
export const setStationPassportResponseSchema: z.ZodMiniType<SetStationPassportResponse> = z.object(
  {
    passport: z.extend(eventPassportSchema, { station_id: z.string() }),
  },
);

/** Agreement 9.7 and 9.8: the station as the board lists it, with the key shown once. */
export const stationKeyResponseSchema: z.ZodMiniType<StationKeyResponse> = z.object({
  station: eventStationBoardStationSchema,
  api_key: z.string(),
});

/** Agreement 9.9: the station as the board lists it, and no key. */
export const stationResponseSchema: z.ZodMiniType<StationResponse> = z.object({
  station: eventStationBoardStationSchema,
});

const count = z.int().check(z.nonnegative());

/** Agreement 9.5. */
export const statsResponseSchema: z.ZodMiniType<StatsResponse> = z.object({
  total_taps: count,
  accepted_taps: count,
  unique_participants: count,
  stations: z.array(
    z.object({
      station_id: z.string(),
      name: z.string(),
      accepted_taps: count,
      unique_participants: count,
    }),
  ),
});

/** Agreement 9.10. Has no user ID, display name or token UID, so nothing here can carry one. */
const mapResponseSchema: z.ZodMiniType<MapResponse> = z.object({
  stations: z.array(
    z.object({
      station_id: z.string(),
      game: z.nullable(z.string()),
      name: z.nullable(z.string()),
      booth: z.nullable(z.string()),
      disabled: z.boolean(),
      taps: count,
      unique_participants: count,
      last_tap_at: z.nullable(isoTimestamp),
    }),
  ),
  connections: z.optional(
    z.object({
      count,
      links: z.array(z.tuple([z.int(), z.int()])),
    }),
  ),
});

/** Agreement 9.3. The log holds stored taps only, so no `duplicate`, and each has a user. */
export const listTapsResponseSchema: z.ZodMiniType<ListTapsResponse> = z.object({
  taps: z.array(
    z.object({
      id: z.int(),
      client_tap_id: z.string(),
      station: z.object({ id: z.string(), name: z.nullable(z.string()) }),
      user: z.object({ id: z.string(), display_name: z.nullable(z.string()) }),
      status: tapStatus,
      source: tapSource,
      tapped_at: z.nullable(isoTimestamp),
      received_at: isoTimestamp,
    }),
  ),
  next_before_id: z.nullable(z.int()),
});

/** Agreement 9.4. A fallback goes only to a passport station, so it is never `no_game`. */
export const fallbackTapResponseSchema: z.ZodMiniType<FallbackTapResponse> = z.object({
  result: z.object({ id: z.int(), status: z.enum(["accepted", "cooldown"]) }),
});

/**
 * The Event Service's /me, matching MeResponse in api/types.ts.
 *
 * It has no `tokens`: version 0.2 removes them from this endpoint as one of its
 * one-off removals (API-AGREEMENT.md:58-61), and the backend stopped sending
 * them at checkpoint 3. A user's tokens are on the GeekyKey Service's /me
 * (API-AGREEMENT.md:8.4), which is a different service and a different session.
 *
 * `connection_requests` is a draft for the agreement's next version (BAC-149). It reads a missing
 * field as none, so a screens build can run against a service that hasn't shipped it yet.
 */
export const meResponseSchema: z.ZodMiniType<MeResponse> = z.object({
  user: userSchema,
  questions: z.nullable(z.array(questionSchema)),
  points: z.int().check(z.nonnegative()),
  stamps: z.array(stampSchema),
  recent_taps: z.array(meTapSchema),
  connection_requests: z.prefault(z.array(connectionRequestSchema), []),
  connections: z.array(connectionSchema),
  // BAC-169, draft for the agreement's next version. Missing with no phrase to see.
  phrase: z.optional(
    z
      .object({
        words: z.array(z.nullable(z.string())).check(z.minLength(2)),
        your_word: z.int().check(z.nonnegative()),
      })
      // Their own word is always one they have, which the card names.
      .check(z.refine(({ words, your_word }) => typeof words[your_word] === "string")),
  ),
});

/** Accepting a connection request's answer (BAC-149, draft for the agreement's next version). */
export const acceptConnectionRequestResponseSchema: z.ZodMiniType<AcceptConnectionRequestResponse> =
  z.object({
    status: z.enum(ACCEPT_CONNECTION_REQUEST_STATUSES),
  });

/** A reaction test's play's answer (BAC-156, for the agreement's next version, 8.11). */
export const playReactionResponseSchema: z.ZodMiniType<PlayReactionResponse> = z.object({
  reaction: reactionSchema,
});

/** A login link to the GeekyKey screens (BAC-157, for the agreement's next version, 8.12). */
export const geekykeyLoginLinkResponseSchema: z.ZodMiniType<GeekykeyLoginLinkResponse> = z.object({
  login_link: z.string().check(z.minLength(1)),
  expires_at: isoTimestamp,
});

/** PATCH /api/v1/me's answer (agreement 8.7), which goes straight into the ["me"] cache. */
export const updateMeResponseSchema: z.ZodMiniType<UpdateMeResponse> = z.object({
  user: userSchema,
});

/**
 * The Event Service's route tests import this schema by this name
 * (apps/event-service/src/test-helpers.ts), so it stays while the screens call the method
 * that answers it `updateMe`. It is the same schema.
 */
export const setDisplayNameResponseSchema = updateMeResponseSchema;

/** GET and POST /api/v1/me/group (draft for agreement 0.14). */
export const myGroupResponseSchema: z.ZodMiniType<MyGroupResponse> = z.object({
  status: z.enum(["not_joined", "waiting", "placed"]),
  allocation_started: z.boolean(),
  group: z.nullable(
    z.object({
      id: z.string(),
      name: z.string(),
      tags: z.array(z.string()),
      location: z.nullable(z.string()),
      members: z.array(z.object({ display_name: z.string() })),
      // BAC-167, draft for the agreement's next version; an older Event Service leaves it out.
      other_groups: z.optional(z.array(z.object({ name: z.string(), reached: z.boolean() }))),
    }),
  ),
});

/** Who may connect (BAC-140, draft for the agreement's next version). */
const connectAcrossSchema = z.enum(CONNECT_ACROSS);

/** PUT /api/v1/admin/connections/rule's answer (BAC-140, draft for the agreement's next version). */
export const connectionRuleSchema: z.ZodMiniType<ConnectionRule> = z.object({
  connect_across: connectAcrossSchema,
});

/** Which challenge a new connection plays (BAC-161, draft for the agreement's next version). */
const challengeSchema = z.enum(CHALLENGES);

/** PUT /api/v1/admin/connections/challenge's answer (BAC-161, draft for the agreement's next version). */
export const connectionChallengeSchema: z.ZodMiniType<ConnectionChallenge> = z.object({
  challenge: challengeSchema,
});

/** A group on the organizers' board, and POST /api/v1/admin/groups's answer. */
export const eventGroupSchema: z.ZodMiniType<EventGroup> = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  location: z.nullable(z.string()),
  capacity: z.nullable(z.int()),
  members: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string(),
      joined_at: isoTimestamp,
      placed_at: isoTimestamp,
      how: z.enum(["allocated", "latecomer", "organizer"]),
    }),
  ),
  // BAC-167, draft for the agreement's next version; an older Event Service leaves it out.
  reached_group_ids: z.optional(z.array(z.string())),
});

/** GET /api/v1/admin/groups and POST /api/v1/admin/groups/allocate. */
export const groupBoardResponseSchema: z.ZodMiniType<GroupBoardResponse> = z.object({
  allocation_started_at: z.nullable(isoTimestamp),
  connect_across: connectAcrossSchema,
  challenge: z.optional(challengeSchema),
  // BAC-169, draft for the agreement's next version; an older Event Service leaves it out.
  phrase: z.optional(
    z.nullable(z.object({ text: z.string(), completed_count: z.int().check(z.nonnegative()) })),
  ),
  joined_count: z.int(),
  groups: z.array(eventGroupSchema),
  waiting: z.array(
    z.object({ user_id: z.string(), display_name: z.string(), joined_at: isoTimestamp }),
  ),
});

export function parseEventStationBoardResponse(input: unknown): EventStationBoardResponse {
  const result = eventStationBoardResponseSchema.safeParse(input);
  if (!result.success) {
    throw new NetworkError("The server returned an unexpected station board");
  }
  return result.data;
}

export function parseMeResponse(input: unknown): MeResponse {
  const result = meResponseSchema.safeParse(input);
  if (!result.success) {
    throw new NetworkError("The server returned an unexpected response");
  }
  return result.data;
}

export function parseUpdateMeResponse(input: unknown): UpdateMeResponse {
  const result = updateMeResponseSchema.safeParse(input);
  if (!result.success) {
    throw new NetworkError("The server returned an unexpected response");
  }
  return result.data;
}

/** Checks an organizer answer against its schema, so a wrong shape fails here and not in a screen. */
function parseOrganizerResponse<T>(schema: z.ZodMiniType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new NetworkError("The server returned an unexpected response");
  }
  return result.data;
}

export const parseStatsResponse = (input: unknown) =>
  parseOrganizerResponse(statsResponseSchema, input);

export const parseMapResponse = (input: unknown) =>
  parseOrganizerResponse(mapResponseSchema, input);

export const parseListTapsResponse = (input: unknown) =>
  parseOrganizerResponse(listTapsResponseSchema, input);

export const parseFallbackTapResponse = (input: unknown) =>
  parseOrganizerResponse(fallbackTapResponseSchema, input);

export const parseStationKeyResponse = (input: unknown) =>
  parseOrganizerResponse(stationKeyResponseSchema, input);

export const parseStationResponse = (input: unknown) =>
  parseOrganizerResponse(stationResponseSchema, input);

export const parseSetStationPassportResponse = (input: unknown) =>
  parseOrganizerResponse(setStationPassportResponseSchema, input);

export const parseMyGroupResponse = (input: unknown) =>
  parseOrganizerResponse(myGroupResponseSchema, input);

export const parseEventGroup = (input: unknown) => parseOrganizerResponse(eventGroupSchema, input);

export const parseGroupBoardResponse = (input: unknown) =>
  parseOrganizerResponse(groupBoardResponseSchema, input);

export const parseConnectionRule = (input: unknown) =>
  parseOrganizerResponse(connectionRuleSchema, input);

export const parseConnectionChallenge = (input: unknown) =>
  parseOrganizerResponse(connectionChallengeSchema, input);

export const parseAcceptConnectionRequestResponse = (input: unknown) =>
  parseOrganizerResponse(acceptConnectionRequestResponseSchema, input);

export const parseGeekykeyLoginLinkResponse = (input: unknown) =>
  parseOrganizerResponse(geekykeyLoginLinkResponseSchema, input);

export const parsePlayReactionResponse = (input: unknown) =>
  parseOrganizerResponse(playReactionResponseSchema, input);
