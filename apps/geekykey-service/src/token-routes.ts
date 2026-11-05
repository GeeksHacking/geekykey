import { Hono } from "hono";
import { z } from "zod";
import type { MeetingStatus } from "@geekykey/handoff";
import type { Claims } from "./claims.ts";
import { withClaimsDeadline } from "./claims-deadline.ts";
import { type EventService, EventServiceUnavailable } from "./event-service.ts";
import { log } from "./lib/log.ts";
import { tokenUid } from "./lib/token-uid.ts";
import { userIdSchema } from "./lib/user-id.ts";
import { pathParams, queryParams } from "./lib/validate.ts";
import { requireSession, type SessionCheck, type SessionEnv } from "./session.ts";

export interface TokenRouteDeps {
  session: SessionCheck;
  claims: Claims;
  /** From config.geekykeyAdmins, checked on every request. */
  geekykeyAdmins: ReadonlySet<string>;
  /** Milliseconds the claims stand-in has to answer, for all of a request's calls together. */
  deadlineMs: number;
  /** From config.maxTokensPerUser: a user holding this many claims no more. */
  maxTokensPerUser: number;
  /** Counts each user's lookups, claims and meetings: the TOKEN_LIMIT binding in wrangler.jsonc. */
  tokenLimit: RateLimit;
  /** The Event Services whose entries take meetings, in EVENT_SERVICES' order. */
  meetingServices: readonly Pick<EventService, "id" | "handOffMeeting">[];
}

/** One Event Service's answer to a half, as the meeting answers it (8.8). */
type MeetingView = {
  event_id: string;
  status: MeetingStatus | "unavailable";
  owner_name: string | null;
};

/** What the lookup answers: who owns the token, as the token page sees it. */
type TokenView = {
  uid: string;
  owner: "nobody" | "you" | "someone_else";
  claimed_at: string | null;
  owner_id: string | null;
};

/**
 * Mounted at /api/v1/tokens. The lookup (the API agreement's 8.5) is what
 * the token page shows once someone is logged in. A token is `nobody`'s, the
 * user's own (`you`, with when they claimed it) or `someone_else`'s, and only
 * a GeekyKey admin is told whose, to release it with (8.3).
 *
 * The claim (8.2) is the token page's Claim and My tokens' claim-by-code form.
 * The first claim wins, and a user holds at most `maxTokensPerUser`. Its
 * checks run in 8.2's order: a token already the user's answers `200`
 * whatever their count, then a user at the limit gets `token_limit_reached`,
 * then the claim itself, which can be `taken`.
 *
 * The release (8.3) is the Release button on the token page and My tokens.
 * An owner releases their own token. A GeekyKey admin releases someone
 * else's by naming its owner in `owner_id`, the one the lookup showed, so a
 * late or double click can't release a newer claim. Either way the token
 * must still be that owner's, or the answer is `not_found`. Every release
 * writes a `token_released` log line, the only trace of it, since no
 * history is kept, and only the route knows who released it. A release
 * that answers `claims_unavailable` may still have been made, so its
 * `claims_unavailable` line names the token and the owner too.
 *
 * Owners come through Claims only, and each request's calls share one
 * deadline. A lookup asks `ownersOf` who owns the token, and when the user
 * does, their own `tokensOf` says when they claimed it. A claim asks
 * `tokensOf` for the first two checks, then `claim`. A release asks
 * `release` alone.
 *
 * The meeting (8.8) is the token page's half of a connection, sent by
 * itself once the lookup says `someone_else`. It asks `tokensOf` for the
 * user's first-claimed token, then `ownersOf` for the token's owner and the
 * kinds of both, and hands the half to each of `meetingServices` at once,
 * within what's left of the same deadline. Each answers its own status and
 * the owner's name, which passes through unstored, or `unavailable` with no
 * name when it doesn't answer properly in time, and is left out when it
 * answers `404`, as one from before meetings does.
 *
 * Every request counts toward the user's USER_LIMIT (src/session.ts). The
 * lookup, the claim and the meeting count toward TOKEN_LIMIT as well, so nobody can work
 * through UIDs to see which are claimed (the API agreement's section 2,
 * "Rate limits"). The release doesn't: a user can only release a token
 * they hold, unless they're a GeekyKey admin.
 */
export function tokenRoutes({
  session,
  claims,
  geekykeyAdmins,
  deadlineMs,
  maxTokensPerUser,
  tokenLimit,
  meetingServices,
}: TokenRouteDeps) {
  return new Hono<SessionEnv>()
    .get(
      "/:uid",
      requireSession(session, tokenLimit),
      pathParams(z.object({ uid: tokenUid })),
      async (c) => {
        const { uid } = c.req.valid("param");
        const { userId } = c.var;
        const view = (
          owner: TokenView["owner"],
          extra: Partial<Pick<TokenView, "claimed_at" | "owner_id">> = {},
        ) => c.json({ token: { uid, owner, claimed_at: null, owner_id: null, ...extra } });

        return await withClaimsDeadline(c, deadlineMs, async (signal) => {
          const ownerId = (await claims.ownersOf([uid], signal)).get(uid)?.userId;
          if (ownerId === undefined) return view("nobody");
          if (ownerId !== userId) {
            return view("someone_else", geekykeyAdmins.has(userId) ? { owner_id: ownerId } : {});
          }
          const mine = (await claims.tokensOf(userId, signal)).find((token) => token.uid === uid);
          // Released between the two calls, which only its owner or a GeekyKey
          // admin can do. A claim since then answers token_taken (8.2).
          if (!mine) return view("nobody");
          return view("you", { claimed_at: mine.claimedAt });
        });
      },
    )
    .post(
      "/:uid/claim",
      requireSession(session, tokenLimit),
      pathParams(z.object({ uid: tokenUid })),
      async (c) => {
        const { uid } = c.req.valid("param");
        const { userId } = c.var;
        const token = (claimedAt: string, status: 200 | 201) =>
          c.json({ token: { uid, claimed_at: claimedAt } }, status);
        return await withClaimsDeadline(c, deadlineMs, async (signal) => {
          const held = await claims.tokensOf(userId, signal);
          const mine = held.find((token) => token.uid === uid);
          if (mine) return token(mine.claimedAt, 200);
          // Even when the token is someone else's. Two claims by one user at
          // the same instant can both pass, leaving them one over: accepted
          // in the migration spec's section 4.
          if (held.length >= maxTokensPerUser) {
            return c.json({ error: "token_limit_reached" }, 409);
          }
          const claimed = await claims.claim(uid, userId, signal);
          if (claimed.result === "taken") return c.json({ error: "token_taken" }, 409);
          return token(claimed.claimedAt, claimed.result === "claimed" ? 201 : 200);
        });
      },
    )
    .post(
      "/:uid/meet",
      requireSession(session, tokenLimit),
      pathParams(z.object({ uid: tokenUid })),
      async (c) => {
        const { uid } = c.req.valid("param");
        const { userId } = c.var;
        return await withClaimsDeadline(c, deadlineMs, async (signal) => {
          // The user's kind is their first-claimed token's (11.10), asked with the owner.
          const first = (await claims.tokensOf(userId, signal))[0]?.uid;
          const owners = await claims.ownersOf(first === undefined ? [uid] : [uid, first], signal);
          const owner = owners.get(uid);
          if (owner === undefined || owner.userId === userId) {
            return c.json({ error: "not_found" }, 404);
          }
          const mine = first === undefined ? undefined : owners.get(first);
          const request = {
            user_id: userId,
            // Released since tokensOf, it has no kind of the user's.
            user_kind: mine?.userId === userId ? mine.kind : null,
            owner_id: owner.userId,
            owner_kind: owner.kind,
          };
          const meetings = await Promise.all(
            meetingServices.map(async (service): Promise<MeetingView | null> => {
              try {
                return {
                  event_id: service.id,
                  ...(await service.handOffMeeting(request, signal)),
                };
              } catch (err) {
                if (!(err instanceof EventServiceUnavailable)) throw err;
                // An Event Service from before meetings, which takes none (11.10).
                if (err.reason === "status" && err.status === 404) return null;
                log("meeting_handoff_failed", {
                  event_service: service.id,
                  user_id: userId,
                  reason: err.reason,
                  status: err.status,
                });
                return { event_id: service.id, status: "unavailable", owner_name: null };
              }
            }),
          );
          return c.json({ meetings: meetings.filter((meeting) => meeting !== null) });
        });
      },
    )
    .delete(
      "/:uid",
      requireSession(session),
      pathParams(z.object({ uid: tokenUid })),
      queryParams(z.object({ owner_id: userIdSchema.optional() })),
      async (c) => {
        const { uid } = c.req.valid("param");
        const { owner_id: givenOwnerId } = c.req.valid("query");
        const { userId } = c.var;
        // Only a GeekyKey admin names the owner, even when it's themselves.
        if (givenOwnerId !== undefined && !geekykeyAdmins.has(userId)) {
          return c.json({ error: "forbidden" }, 403);
        }
        const ownerId = givenOwnerId ?? userId;
        return await withClaimsDeadline(
          c,
          deadlineMs,
          async (signal) => {
            if ((await claims.release(uid, ownerId, signal)) === "not_owner") {
              return c.json({ error: "not_found" }, 404);
            }
            log("token_released", { uid, owner_id: ownerId, released_by: userId });
            return c.body(null, 204);
          },
          { uid, owner_id: ownerId },
        );
      },
    );
}
