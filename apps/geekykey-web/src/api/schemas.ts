import * as z from "zod/mini";

import { NetworkError } from "@/api/errors";
import { MEETING_STATUSES } from "@/api/types";
import type {
  LoginLink,
  Meeting,
  MeResponse,
  Token,
  TokenKindsLoaded,
  TokenKindTotal,
  TokenLookup,
} from "@/api/types";

const isoTimestamp = z.iso.datetime({ offset: true });
const tokenOwner = z.enum(["nobody", "you", "someone_else"]);

const tokenSchema: z.ZodMiniType<Token> = z.object({
  uid: z.string(),
  claimed_at: z.nullable(isoTimestamp),
});

const eventServiceLinkSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
});

const tokenLookupSchema: z.ZodMiniType<TokenLookup> = z.object({
  uid: z.string(),
  owner: tokenOwner,
  claimed_at: z.nullable(isoTimestamp),
  owner_id: z.nullable(z.string()),
});

/** The GeekyKey Service's /me (agreement 8.4). Note: no display name and no points. */
const meResponseSchema: z.ZodMiniType<MeResponse> = z.object({
  user: z.object({
    id: z.string(),
    is_geekykey_admin: z.boolean(),
    can_view_token_kinds: z.optional(z.boolean()),
  }),
  tokens: z.array(tokenSchema),
  events: z.array(eventServiceLinkSchema),
});

const tokenLookupResponseSchema = z.object({ token: tokenLookupSchema });

const claimResponseSchema = z.object({ token: tokenSchema });

/** Agreement 8.6: the answer is the link itself, with no wrapper. */
const loginLinkResponseSchema: z.ZodMiniType<LoginLink> = z.object({
  url: z.string(),
  expires_at: isoTimestamp,
});

/** One Event Service's answer to a half, in 11.10's words (agreement 8.8). */
const meetingStatusSchema = z.enum(MEETING_STATUSES);

const meetingSchema: z.ZodMiniType<Meeting> = z.object({
  event_id: z.string(),
  status: meetingStatusSchema,
  // A previous GeekyKey Service sends no name (BAC-143).
  owner_name: z.prefault(z.nullable(z.string()), null),
  // A previous GeekyKey Service sends no bio (BAC-151).
  owner_bio: z.prefault(z.nullable(z.string()), null),
});

/** Agreement 8.8: one item for each Event Service that takes meetings, in /me's order. */
const meetingResponseSchema = z.object({ meetings: z.array(meetingSchema) });

const count = z.number().check(z.int(), z.nonnegative());

/** GET /api/v1/admin/token-kinds (BAC-139): the list's total per kind. */
const tokenKindsResponseSchema: z.ZodMiniType<{ kinds: TokenKindTotal[] }> = z.object({
  kinds: z.array(z.object({ kind: z.string(), tokens: count })),
});

/** POST /api/v1/admin/token-kinds (BAC-139). */
const tokenKindsLoadedSchema: z.ZodMiniType<TokenKindsLoaded> = z.object({
  new: count,
  changed: count,
  unchanged: count,
});

/** One helper for every parse, so an unexpected shape is always a NetworkError. */
function parse<T>(schema: z.ZodMiniType<T>, input: unknown, what: string): T {
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

export function parseLoginLinkResponse(input: unknown): LoginLink {
  return parse(loginLinkResponseSchema, input, "login link");
}

export function parseMeetingResponse(input: unknown): Meeting[] {
  return parse(meetingResponseSchema, input, "meeting").meetings;
}

export function parseTokenKindsResponse(input: unknown): TokenKindTotal[] {
  return parse(tokenKindsResponseSchema, input, "token kinds").kinds;
}

export function parseTokenKindsLoaded(input: unknown): TokenKindsLoaded {
  return parse(tokenKindsLoadedSchema, input, "load");
}
