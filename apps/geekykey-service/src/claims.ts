import { tokenKind } from "@geekykey/handoff";
import { z, type ZodType } from "zod";
import { askService, type Send, Unanswered } from "./service-request.ts";

/**
 * Who owns each token: the claims stand-in until the switch, then the Portal's
 * tag APIs. Only this module knows which, so the switch changes one
 * implementation and nothing else (the migration spec, section 4).
 *
 * Every call gives up when its `signal` fires: a station request's shared
 * deadline, or a screen's own. There's no retry. UIDs arrive normalised.
 */
export interface Claims {
  /**
   * The owners of up to 500 tokens, by UID, each with the token's kind. A UID
   * missing from the map is unclaimed.
   */
  ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, TokenOwner>>;
  /**
   * Claims the token for the user. The first claim wins, and `claimedAt` is
   * when the user's claim was made, for the claim route's answer.
   */
  claim(
    uid: string,
    userId: string,
    signal: AbortSignal,
  ): Promise<{ result: "claimed" | "already_yours"; claimedAt: string } | { result: "taken" }>;
  /** Releases the token, but only if `ownerId` still owns it. */
  release(uid: string, ownerId: string, signal: AbortSignal): Promise<"released" | "not_owner">;
  /** The user's tokens, oldest claim first. */
  tokensOf(userId: string, signal: AbortSignal): Promise<ClaimedToken[]>;
  /** Every token with a kind or a claim (agreement 10.2). */
  listKindTokens(signal: AbortSignal): Promise<KindToken[]>;
  removeKind(uid: string, signal: AbortSignal): Promise<"removed" | "claimed" | "not_found">;
  /** How many tokens each kind has on the list of token kinds, by kind in order. */
  kindTotals(signal: AbortSignal): Promise<KindTotal[]>;
  /**
   * Puts up to 500 tokens on the list of token kinds, each taking the kind given.
   * Removes nothing, so a token not named keeps its kind.
   */
  loadKinds(tokens: TokenKind[], signal: AbortSignal): Promise<KindsLoaded>;
}

/** Who owns a token, and the token's kind (ADR 0006): null for a token with none. */
export interface TokenOwner {
  userId: string;
  kind: string | null;
}

/** One of a user's tokens, and when they claimed it. */
export interface ClaimedToken {
  uid: string;
  claimedAt: string;
}

/** One token on the list of token kinds, and its kind. */
export interface TokenKind {
  uid: string;
  kind: string;
}

/** The admin list (agreement 10.2): claims without kinds are included. */
export interface KindToken {
  uid: string;
  kind: string | null;
  ownerId: string | null;
  claimedAt: string | null;
}

/** How many tokens on the list of token kinds have one kind. */
export interface KindTotal {
  kind: string;
  tokens: number;
}

/** What a load did: tokens new to the list, ones whose kind changed, and ones that had it already. */
export interface KindsLoaded {
  new: number;
  changed: number;
  unchanged: number;
}

/**
 * Whatever holds the claims didn't answer properly in time. A station request
 * answers it with `503 claims_unavailable`, and the screens with "Couldn't
 * reach GeeksHacking. Try again."
 */
export class ClaimsUnavailable extends Unanswered {
  override name = "ClaimsUnavailable";
}

const ownersAnswer = z.object({
  owners: z.array(
    z.object({
      uid: z.string(),
      user_id: z.string(),
      // A stand-in from before kinds gives none, which reads as none, so either side can be
      // rolled back alone. Held to the hand-off's rule, so a kind that can't be handed off
      // fails here, as the stand-in's fault, and not at the Event Service.
      kind: tokenKind.optional().transform((kind) => kind ?? null),
    }),
  ),
});
const claimAnswer = z.union([
  z.object({ result: z.enum(["claimed", "already_yours"]), claimed_at: z.string() }),
  z.object({ result: z.literal("taken"), claimed_at: z.null() }),
]);
const releaseAnswer = z.object({ result: z.enum(["released", "not_owner"]) });
const tokensAnswer = z.object({
  tokens: z.array(z.object({ uid: z.string(), claimed_at: z.string() })),
});
const kindTokensAnswer = z.object({
  tokens: z.array(
    z.object({
      uid: z.string(),
      kind: tokenKind,
      owner_id: z.string().nullable(),
      claimed_at: z.iso.datetime().nullable(),
    }),
  ),
});
const kindRemovedAnswer = z.object({ result: z.enum(["removed", "claimed", "not_found"]) });
const kindTotalsAnswer = z.object({
  kinds: z.array(z.object({ kind: z.string(), tokens: z.number() })),
});
const kindsLoadedAnswer = z.object({
  new: z.number(),
  changed: z.number(),
  unchanged: z.number(),
});

/**
 * Claims, from the claims stand-in's routes on the Event Service's server
 * (apps/event-service/src/claims-stand-in/routes.ts), with CLAIMS_STAND_IN_KEY.
 */
export class StandInClaims implements Claims {
  #url: string;
  #key: string;
  #send: Send;

  /**
   * `url` is where the stand-in's routes start, such as
   * `https://event-api.geekshacking.com/claims-stand-in/v1`.
   */
  constructor({ url, key, send }: { url: string; key: string; send: Send }) {
    this.#url = url;
    this.#key = key;
    this.#send = send;
  }

  async ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, TokenOwner>> {
    if (uids.length === 0) return new Map();
    const { owners } = await this.#call("POST", "/owners", { uids }, ownersAnswer, signal);
    return new Map(owners.map((owner) => [owner.uid, { userId: owner.user_id, kind: owner.kind }]));
  }

  async claim(uid: string, userId: string, signal: AbortSignal) {
    const path = `/tokens/${uid}/claim`;
    const claimed = await this.#call("POST", path, { user_id: userId }, claimAnswer, signal);
    if (claimed.result === "taken") return { result: claimed.result };
    return { result: claimed.result, claimedAt: claimed.claimed_at };
  }

  async release(uid: string, ownerId: string, signal: AbortSignal) {
    const path = `/tokens/${uid}/release`;
    return (await this.#call("POST", path, { owner_id: ownerId }, releaseAnswer, signal)).result;
  }

  async tokensOf(userId: string, signal: AbortSignal) {
    const path = `/users/${encodeURIComponent(userId)}/tokens`;
    const { tokens } = await this.#call("GET", path, undefined, tokensAnswer, signal);
    return tokens.map((token) => ({ uid: token.uid, claimedAt: token.claimed_at }));
  }

  async listKindTokens(signal: AbortSignal) {
    const { tokens } = await this.#call(
      "GET",
      "/token-kinds/tokens",
      undefined,
      kindTokensAnswer,
      signal,
    );
    return tokens.map(({ uid, kind, owner_id, claimed_at }) => ({
      uid,
      kind,
      ownerId: owner_id,
      claimedAt: claimed_at,
    }));
  }

  async removeKind(uid: string, signal: AbortSignal) {
    return (await this.#call("DELETE", `/token-kinds/${uid}`, undefined, kindRemovedAnswer, signal))
      .result;
  }

  async kindTotals(signal: AbortSignal) {
    const { kinds } = await this.#call("GET", "/token-kinds", undefined, kindTotalsAnswer, signal);
    return kinds;
  }

  async loadKinds(tokens: TokenKind[], signal: AbortSignal) {
    return await this.#call("POST", "/token-kinds", { tokens }, kindsLoadedAnswer, signal);
  }

  /**
   * One request to the stand-in, and its answer checked against `answer`.
   * Throws ClaimsUnavailable for anything but a 2xx whose body fits, or when
   * `signal` fires first.
   */
  async #call<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: unknown,
    answer: ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return await askService(this.#send, {
      method,
      url: this.#url + path,
      key: this.#key,
      body,
      answer,
      signal,
      fail: ClaimsUnavailable,
    });
  }
}
