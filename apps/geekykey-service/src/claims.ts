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
  /** The owners of up to 500 tokens, by UID. A UID missing from the map is unclaimed. */
  ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, string>>;
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
}

/** One of a user's tokens, and when they claimed it. */
export interface ClaimedToken {
  uid: string;
  claimedAt: string;
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
  owners: z.array(z.object({ uid: z.string(), user_id: z.string() })),
});
const claimAnswer = z.union([
  z.object({ result: z.enum(["claimed", "already_yours"]), claimed_at: z.string() }),
  z.object({ result: z.literal("taken"), claimed_at: z.null() }),
]);
const releaseAnswer = z.object({ result: z.enum(["released", "not_owner"]) });
const tokensAnswer = z.object({
  tokens: z.array(z.object({ uid: z.string(), claimed_at: z.string() })),
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

  async ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, string>> {
    if (uids.length === 0) return new Map();
    const { owners } = await this.#call("POST", "/owners", { uids }, ownersAnswer, signal);
    return new Map(owners.map((owner) => [owner.uid, owner.user_id]));
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

  /**
   * One request to the stand-in, and its answer checked against `answer`.
   * Throws ClaimsUnavailable for anything but a 2xx whose body fits, or when
   * `signal` fires first.
   */
  async #call<T>(
    method: "GET" | "POST",
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
