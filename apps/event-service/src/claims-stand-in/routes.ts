import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { requireBearerKey } from "../lib/bearer-key.ts";
import { errorCode } from "../lib/log.ts";
import { UID_PATTERN } from "../lib/token-uid.ts";
import { jsonBody, pathParams } from "../lib/validate.ts";
import { tokens } from "./schema.ts";

/** The most UIDs one request may ask about: a station's largest batch. */
const MAX_UIDS = 500;

/** Only the GeekyKey Service calls the stand-in, and it normalises every UID first. */
const uid = z.string().regex(UID_PATTERN, "uid must be 4 to 10 hex bytes, normalised");
/** As long as the columns allow. */
const userId = z.string().min(1).max(128);
const tokenPath = pathParams(z.object({ uid }));

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
              .select({ uid: tokens.uid, userId: tokens.userId })
              .from(tokens)
              .where(inArray(tokens.uid, uids));
      // A token nobody owns is left out.
      return c.json({ owners: owners.map((o) => ({ uid: o.uid, user_id: o.userId })) });
    })
    .post("/tokens/:uid/claim", tokenPath, jsonBody(z.object({ user_id: userId })), async (c) => {
      const { uid } = c.req.valid("param");
      const { user_id } = c.req.valid("json");
      const { db } = c.var;

      // The first claim wins: the uid is the table's key, so of two claims
      // at once, one insert fails, and that claim reads who won.
      const claimedAt = new Date().toISOString();
      try {
        await db.insert(tokens).values({ uid, userId: user_id, claimedAt });
        return c.json({ result: "claimed", claimed_at: claimedAt });
      } catch (err) {
        if (errorCode(err) !== "ER_DUP_ENTRY") throw err;
      }
      const [current] = await db
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
    });
}
