import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Claims } from "./claims.ts";
import { withClaimsDeadline } from "./claims-deadline.ts";
import { log } from "./lib/log.ts";
import { tokenUid } from "./lib/token-uid.ts";
import { jsonBody, pathParams } from "./lib/validate.ts";
import { requireSession, type SessionCheck, type SessionEnv } from "./session.ts";

export interface TokenKindRouteDeps {
  session: SessionCheck;
  claims: Claims;
  /** From config.geekykeyAdmins, checked on every request. */
  geekykeyAdmins: ReadonlySet<string>;
  /** Who may read the totals, GeekyKey admins included, checked on every request. */
  tokenKindViewers: ReadonlySet<string>;
  /** Milliseconds the claims stand-in has to answer. */
  deadlineMs: number;
}

/** The most tokens one load may carry: what one request to the stand-in may name. */
const MAX_TOKENS_PER_LOAD = 500;

const loadBody = z.object({
  tokens: z
    .array(
      z.object({
        uid: tokenUid,
        // The token writer's one capital letter (firmware/README.md, "Writing tokens").
        kind: z.string().regex(/^[A-Z]$/, "kind must be one capital letter"),
      }),
    )
    .min(1)
    .max(MAX_TOKENS_PER_LOAD),
});

/**
 * Mounted at /api/v1/admin/token-kinds: the token kinds screen on the GeekyKey
 * screens (BAC-139). The GET counts the tokens of each kind on the list, and the
 * POST loads tokens read from the token writer's log, answering how many were
 * new, changed kind or already had it. A load never removes a token.
 *
 * The screen reads the log, so what arrives here is already one kind for each
 * UID. UIDs stay on the GeekyKey side, here and in the claims stand-in: an Event
 * Service never sees one (the API agreement's 11.8). Every load writes a
 * `token_kinds_loaded` log line naming who did it. A load that answers
 * `claims_unavailable` may still have been made, and sending it again does no
 * harm.
 *
 * Agreement 10.2 and 10.3 add an admin-only UID list and kind removal.
 * Removal refuses a claim atomically in the stand-in and logs the admin and UID.
 * A GeekyKey admin does both. `tokenKindViewers`, the Event Services' organizers,
 * only read the totals, which carry no UIDs. Who's asking is checked before the
 * body is read. Every request counts toward the user's USER_LIMIT (src/session.ts).
 */
export function tokenKindRoutes({
  session,
  claims,
  geekykeyAdmins,
  tokenKindViewers,
  deadlineMs,
}: TokenKindRouteDeps) {
  const requireOn =
    (allowed: ReadonlySet<string>): MiddlewareHandler<SessionEnv> =>
    async (c, next) => {
      if (!allowed.has(c.var.userId)) return c.json({ error: "forbidden" }, 403);
      return await next();
    };

  return new Hono<SessionEnv>()
    .use(requireSession(session))
    .get("/", requireOn(tokenKindViewers), async (c) =>
      withClaimsDeadline(c, deadlineMs, async (signal) => {
        return c.json({ kinds: await claims.kindTotals(signal) });
      }),
    )
    .get("/tokens", requireOn(geekykeyAdmins), async (c) =>
      withClaimsDeadline(c, deadlineMs, async (signal) =>
        c.json({
          tokens: (await claims.listKindTokens(signal)).map(
            ({ uid, kind, ownerId, claimedAt }) => ({
              uid,
              kind,
              owner_id: ownerId,
              claimed_at: claimedAt,
            }),
          ),
        }),
      ),
    )
    .delete(
      "/:uid",
      requireOn(geekykeyAdmins),
      pathParams(z.object({ uid: tokenUid })),
      async (c) => {
        const { uid } = c.req.valid("param");
        return await withClaimsDeadline(
          c,
          deadlineMs,
          async (signal) => {
            const result = await claims.removeKind(uid, signal);
            if (result === "claimed") return c.json({ error: "token_claimed" }, 409);
            if (result === "not_found") return c.json({ error: "not_found" }, 404);
            log("token_kind_removed", { removed_by: c.var.userId, uid });
            return c.body(null, 204);
          },
          { uid },
        );
      },
    )
    .post("/", requireOn(geekykeyAdmins), jsonBody(loadBody), async (c) => {
      const { tokens } = c.req.valid("json");
      return await withClaimsDeadline(c, deadlineMs, async (signal) => {
        const loaded = await claims.loadKinds(tokens, signal);
        log("token_kinds_loaded", { loaded_by: c.var.userId, ...loaded });
        return c.json(loaded);
      });
    });
}
