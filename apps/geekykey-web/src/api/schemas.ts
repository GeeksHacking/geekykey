import { z } from "zod";

import { NetworkError } from "@/api/errors";
import type { MeResponse, Token, TokenLookup } from "@/api/types";

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
