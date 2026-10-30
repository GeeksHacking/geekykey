import * as z from "zod/mini";

import { NetworkError } from "@/api/errors";
import type { LoginLink, MeResponse, Token, TokenLookup } from "@/api/types";

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
  user: z.object({ id: z.string(), is_geekykey_admin: z.boolean() }),
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
