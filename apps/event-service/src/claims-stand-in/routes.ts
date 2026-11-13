import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { requireBearerKey } from "../lib/bearer-key.ts";
import { errorCode } from "../lib/log.ts";
import { UID_PATTERN } from "../lib/token-uid.ts";
import { jsonBody, pathParams } from "../lib/validate.ts";
import { tokenKinds, tokens } from "./schema.ts";

/** The most UIDs one request may name: a station's largest batch, or one load of token kinds. */
const MAX_UIDS = 500;

/** Only the GeekyKey Service calls the stand-in, and it normalises every UID first. */
const uid = z.string().regex(UID_PATTERN, "uid must be 4 to 10 hex bytes, normalised");
/** As long as the columns allow. */
const userId = z.string().min(1).max(128);
const tokenPath = pathParams(z.object({ uid }));
/** The token writer's one capital letter (firmware/README.md, "Writing tokens"). */
const kind = z.string().regex(/^[A-Z]$/, "kind must be one capital letter");

/**
 * The claims stand-in's routes (mounted at /claims-stand-in/v1): who owns
 * each token, until the GeekyKey Service asks the Portal's tag APIs instead.
 * Only the GeekyKey Service calls them, with CLAIMS_STAND_IN_KEY, so they aren't
 * in the API agreement. Their shapes are the migration spec's, section 4.
 *
 * GeekyKey's stand-in, removed after the switch.
 */
export function claimsStandInRoutes({ key }: { key: string }) {
  return new Hono<AppEnv>()
    .use(requireBearerKey(key, "invalid_claims_stand_in_key"))
    .post("/owners", jsonBody(z.object({ uids: z.array(uid).max(MAX_UIDS) })), async (c) => {
      const { uids } = c.req.valid("json");
      const owners =
        uids.length === 0
          ? []
          : await c.var.db
              .select({ uid: tokens.uid, userId: tokens.userId, kind: tokenKinds.kind })
              .from(tokens)
              .leftJoin(tokenKinds, eq(tokenKinds.uid, tokens.uid))
              .where(inArray(tokens.uid, uids));
      // A token nobody owns is left out. Each owner comes with the token's kind, in the same
      // read, so a tap costs no extra request (ADR 0006). Null for a token not in the list.
      return c.json({
        owners: owners.map((o) => ({ uid: o.uid, user_id: o.userId, kind: o.kind })),
      });
    })
    .post("/tokens/:uid/claim", tokenPath, jsonBody(z.object({ user_id: userId })), async (c) => {
      const { uid } = c.req.valid("param");
      const { user_id } = c.req.valid("json");
      const { db } = c.var;

      // The first claim wins: the uid is the table's key, so of two claims
      // at once, one insert fails, and that claim reads who won.
      return await db.transaction(async (tx) => {
        // Share the kind row's lock with removal: a claim already in progress keeps its kind.
        await tx
          .select({ uid: tokenKinds.uid })
          .from(tokenKinds)
          .where(eq(tokenKinds.uid, uid))
          .for("update");
        const claimedAt = new Date().toISOString();
        try {
          await tx.insert(tokens).values({ uid, userId: user_id, claimedAt });
          return c.json({ result: "claimed", claimed_at: claimedAt });
        } catch (err) {
          if (errorCode(err) !== "ER_DUP_ENTRY") throw err;
        }
        const [current] = await tx
          .select({ userId: tokens.userId, claimedAt: tokens.claimedAt })
          .from(tokens)
          .where(eq(tokens.uid, uid))
          .limit(1);
        if (current?.userId === user_id) {
          return c.json({ result: "already_yours", claimed_at: current.claimedAt });
        }
        // Nothing about someone else's claim, not even when. A token released
        // since the insert failed is free again, and a second try claims it.
        return c.json({ result: "taken", claimed_at: null });
      });
    })
    .post(
      "/tokens/:uid/release",
      tokenPath,
      jsonBody(z.object({ owner_id: userId })),
      async (c) => {
        const { uid } = c.req.valid("param");
        const { owner_id } = c.req.valid("json");
        // Only while owner_id still owns it: a release that arrives after
        // someone else's claim leaves that claim alone.
        const [result] = await c.var.db
          .delete(tokens)
          .where(and(eq(tokens.uid, uid), eq(tokens.userId, owner_id)));
        return c.json({ result: result.affectedRows === 1 ? "released" : "not_owner" });
      },
    )
    .get("/users/:user_id/tokens", pathParams(z.object({ user_id: userId })), async (c) => {
      const { user_id } = c.req.valid("param");
      const theirs = await c.var.db
        .select({ uid: tokens.uid, claimedAt: tokens.claimedAt })
        .from(tokens)
        .where(eq(tokens.userId, user_id))
        .orderBy(asc(tokens.claimedAt), asc(tokens.uid));
      return c.json({ tokens: theirs.map((t) => ({ uid: t.uid, claimed_at: t.claimedAt })) });
    })
    .get("/token-kinds", async (c) => {
      const totals = await c.var.db
        .select({ kind: tokenKinds.kind, tokens: count() })
        .from(tokenKinds)
        .groupBy(tokenKinds.kind)
        .orderBy(asc(tokenKinds.kind));
      return c.json({ kinds: totals });
    })
    .get("/token-kinds/tokens", async (c) => {
      // The union includes claimed tokens that were never on the kinds list (BAC-152).
      const rows = await c.var.db
        .select({
          uid: tokenKinds.uid,
          kind: sql<string | null>`${tokenKinds.kind}`.as("kind"),
          owner_id: sql<string | null>`${tokens.userId}`.as("owner_id"),
          claimed_at: sql<string | null>`${tokens.claimedAt}`.as("claimed_at"),
        })
        .from(tokenKinds)
        .leftJoin(tokens, eq(tokens.uid, tokenKinds.uid))
        .unionAll(
          c.var.db
            .select({
              uid: tokens.uid,
              kind: sql<string | null>`${tokenKinds.kind}`.as("kind"),
              owner_id: sql<string | null>`${tokens.userId}`.as("owner_id"),
              claimed_at: sql<string | null>`${tokens.claimedAt}`.as("claimed_at"),
            })
            .from(tokens)
            .leftJoin(tokenKinds, eq(tokenKinds.uid, tokens.uid))
            .where(isNull(tokenKinds.uid)),
        )
        .orderBy(sql`uid`);
      return c.json({ tokens: rows });
    })
    .delete("/token-kinds/:uid", tokenPath, async (c) => {
      const { uid } = c.req.valid("param");
      const result = await c.var.db.transaction(async (tx) => {
        // Lock in the same order as claiming. A separate owners lookup could race a claim.
        const [listed] = await tx
          .select({ uid: tokenKinds.uid })
          .from(tokenKinds)
          .where(eq(tokenKinds.uid, uid))
          .for("update");
        const [owner] = await tx
          .select({ uid: tokens.uid })
          .from(tokens)
          .where(eq(tokens.uid, uid))
          .for("update");
        if (owner) return "claimed";
        if (!listed) return "not_found";
        await tx.delete(tokenKinds).where(eq(tokenKinds.uid, uid));
        return "removed";
      });
      return c.json({ result });
    })
    .post(
      "/token-kinds",
      jsonBody(
        z.object({
          tokens: z
            .array(z.object({ uid, kind, written_at: z.iso.datetime({ precision: 3 }).optional() }))
            .max(MAX_UIDS),
        }),
      ),
      async (c) => {
        const { db } = c.var;
        const latest = new Map<string, { uid: string; kind: string; written_at?: string }>();
        for (const token of c.req.valid("json").tokens) {
          const before = latest.get(token.uid);
          // A paste load keeps a UID's last entry (agreement 10.1). A writer upload keeps its
          // latest write, the last one on a tie (10.4).
          if (!before?.written_at || !token.written_at || token.written_at >= before.written_at) {
            latest.set(token.uid, token);
          }
        }
        const counts = await db.transaction(async (tx) => {
          const counts = { new: 0, changed: 0, unchanged: 0, outdated: 0 };
          const ordered = [...latest.values()].sort((a, b) => a.uid.localeCompare(b.uid));
          if (ordered.length === 0) return counts;
          // Reserve absent UIDs and lock existing ones in UID order, including concurrent
          // first uploads. The empty kind is private to this transaction: every reserved
          // row is filled below, or the whole transaction rolls back.
          await tx
            .insert(tokenKinds)
            .values(ordered.map(({ uid }) => ({ uid, kind: "" })))
            .onDuplicateKeyUpdate({ set: { uid: sql`token_kinds.uid` } });
          const existing = await tx
            .select()
            .from(tokenKinds)
            .where(
              inArray(
                tokenKinds.uid,
                ordered.map(({ uid }) => uid),
              ),
            )
            .orderBy(asc(tokenKinds.uid))
            .for("update");
          const current = new Map(existing.map((row) => [row.uid, row]));
          const writes = [];
          for (const token of ordered) {
            const before = current.get(token.uid)!;
            if (token.written_at && before.writtenAt && before.writtenAt >= token.written_at) {
              counts.outdated++;
              continue;
            }
            if (before.kind === "") counts.new++;
            else if (before.kind === token.kind) counts.unchanged++;
            else counts.changed++;
            writes.push({
              uid: token.uid,
              kind: token.kind,
              writtenAt: token.written_at ?? before.writtenAt,
            });
          }
          if (writes.length > 0) {
            // The comparison happened under the locks above. No conditional assignments
            // depend on MySQL/TiDB's left-to-right evaluation of an upsert's setters.
            await tx
              .insert(tokenKinds)
              .values(writes)
              .onDuplicateKeyUpdate({
                set: {
                  kind: sql`VALUES(kind)`,
                  writtenAt: sql`VALUES(written_at)`,
                },
              });
          }
          return counts;
        });
        return c.json(counts);
      },
    );
}
