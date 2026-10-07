import { z } from "zod";

import { NetworkError } from "@/api/errors";
import type {
  CreateStationResponse,
  ListStationsResponse,
  MeResponse,
  ReplaceStationKeyResponse,
  SetStationLinkRequest,
  Station,
  Token,
  TokenLookup,
} from "@/api/types";

const isoTimestamp = z.iso.datetime({ offset: true });
const tokenOwner = z.enum(["nobody", "you", "someone_else"]);

const tokenSchema: z.ZodType<Token> = z.object({
  uid: z.string(),
  claimed_at: isoTimestamp.nullable(),
});

const eventServiceLinkSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
});

const stationLinkSchema = z.object({
  event_service_id: z.string(),
  event_service_name: z.string().nullable(),
  linked_at: isoTimestamp,
});

const stationSchema: z.ZodType<Station> = z.object({
  id: z.string(),
  label: z.string(),
  created_at: isoTimestamp,
  link: stationLinkSchema.nullable(),
  disabled_at: isoTimestamp.nullable(),
  last_seen_at: isoTimestamp.nullable(),
  online: z.boolean(),
  firmware_version: z.string().nullable(),
  buffered_taps: z.number().int().nonnegative().nullable(),
  reader_ok: z.boolean().nullable(),
});

const tokenLookupSchema: z.ZodType<TokenLookup> = z.object({
  uid: z.string(),
  owner: tokenOwner,
  claimed_at: isoTimestamp.nullable(),
  owner_id: z.string().nullable(),
});

/** The GeekyKey Service's /me (agreement 8.4). Note: no display name and no points. */
export const meResponseSchema: z.ZodType<MeResponse> = z.object({
  user: z.object({ id: z.string(), is_geekykey_admin: z.boolean() }),
  tokens: z.array(tokenSchema),
  events: z.array(eventServiceLinkSchema),
});

export const tokenLookupResponseSchema = z.object({ token: tokenLookupSchema });

export const claimResponseSchema = z.object({ token: tokenSchema });

export const listStationsResponseSchema: z.ZodType<ListStationsResponse> = z.object({
  stations: z.array(stationSchema),
  event_services: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const createStationResponseSchema: z.ZodType<CreateStationResponse> = z.object({
  station: stationSchema,
  api_key: z.string(),
});

export const replaceStationKeyResponseSchema: z.ZodType<ReplaceStationKeyResponse> = z.object({
  station: stationSchema,
  api_key: z.string(),
});

/** PUT link and the disable/enable endpoints all answer with the bare station. */
export const stationResponseSchema = z.object({ station: stationSchema });

export const setStationLinkRequestSchema: z.ZodType<SetStationLinkRequest> = z.object({
  event_service_id: z.string().nullable(),
});

/** One helper for every parse, so an unexpected shape is always a NetworkError. */
function parse<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new NetworkError(`The server returned an unexpected ${what}`);
  }
  return result.data;
}

export function parseMeResponse(input: unknown): MeResponse {
  return parse(meResponseSchema, input, "response");
}

export function parseTokenLookupResponse(input: unknown): TokenLookup {
  return parse(tokenLookupResponseSchema, input, "token").token;
}

export function parseClaimResponse(input: unknown): Token {
  return parse(claimResponseSchema, input, "token").token;
}

export function parseListStationsResponse(input: unknown): ListStationsResponse {
  return parse(listStationsResponseSchema, input, "station list");
}

export function parseCreateStationResponse(input: unknown): CreateStationResponse {
  return parse(createStationResponseSchema, input, "station");
}

export function parseReplaceStationKeyResponse(input: unknown): ReplaceStationKeyResponse {
  return parse(replaceStationKeyResponseSchema, input, "station key");
}

export function parseStationResponse(input: unknown): Station {
  return parse(stationResponseSchema, input, "station").station;
}
