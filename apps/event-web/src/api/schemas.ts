import * as z from "zod/mini";

import { NetworkError } from "@/api/errors";
import type {
  EventStationBoardResponse,
  FallbackTapResponse,
  ListTapsResponse,
  MapResponse,
  MeResponse,
  SetDisplayNameResponse,
  SetStationPassportResponse,
  StationKeyResponse,
  StationResponse,
  StatsResponse,
} from "@/api/types";

/*
  Seven of the response schemas below are exported for the Event Service's route tests,
  which import this file by path and parse their answers with them
  (apps/event-service/src/test-helpers.ts). TypeScript cannot see that caller, so a
  dead-export sweep must leave those seven alone.
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
});

const stampSchema = z.object({
  station_id: z.string(),
  name: z.string(),
  location: z.nullable(z.string()),
  points: z.int().check(z.nonnegative()),
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
 */
export const meResponseSchema: z.ZodMiniType<MeResponse> = z.object({
  user: userSchema,
  points: z.int().check(z.nonnegative()),
  stamps: z.array(stampSchema),
  recent_taps: z.array(meTapSchema),
});

/** PATCH /api/v1/me's answer (agreement 8.7), which goes straight into the ["me"] cache. */
const setDisplayNameResponseSchema: z.ZodMiniType<SetDisplayNameResponse> = z.object({
  user: userSchema,
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

export function parseSetDisplayNameResponse(input: unknown): SetDisplayNameResponse {
  const result = setDisplayNameResponseSchema.safeParse(input);
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
