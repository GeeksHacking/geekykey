import { Hono } from "hono";
import { z } from "zod";
import type { Claims, WrittenTokenKind } from "./claims.ts";
import { withClaimsDeadline } from "./claims-deadline.ts";
import { bearerKey } from "./lib/bearer-key.ts";
import { log } from "./lib/log.ts";
import { tokenUid } from "./lib/token-uid.ts";
import { jsonBody } from "./lib/validate.ts";
import { rateLimited } from "./rate-limit.ts";

const uploadBody = z.object({
  tokens: z
    .array(
      z.object({
        uid: tokenUid,
        kind: z.string().regex(/^[A-Z]$/, "kind must be one capital letter"),
        written_ago_ms: z.number().int().min(0).max(604800000),
      }),
    )
    .min(1)
    .max(50),
});

type WriterEnv = { Variables: { arrivedAt: number } };

/** The writer key may only upload token kinds. It authenticates before any body is read. */
export function tokenWriterRoutes({
  claims,
  keyHash,
  writerLimit,
  deadlineMs,
}: {
  claims: Claims;
  keyHash: string | null;
  writerLimit: RateLimit;
  deadlineMs: number;
}) {
  return new Hono<WriterEnv>()
    .use(async (c, next) => {
      c.set("arrivedAt", Date.now());
      const key = bearerKey(c.req.header("Authorization"));
      // keyHash is null unless config.ts found 64 lower-case hex characters.
      if (!key || !keyHash || !/^gk_wri_[0-9a-f]{64}$/.test(key)) {
        return c.json({ error: "unauthenticated" }, 401);
      }
      const given = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
      const expected = Uint8Array.from(keyHash.match(/../g)!, (byte) => parseInt(byte, 16));
      if (!crypto.subtle.timingSafeEqual(given, expected))
        return c.json({ error: "unauthenticated" }, 401);
      if (!(await writerLimit.limit({ key: keyHash })).success)
        return rateLimited(c, { token_writer: true });
      return await next();
    })
    .post("/", jsonBody(uploadBody), async (c) => {
      const latest = new Map<string, WrittenTokenKind>();
      for (const { uid, kind, written_ago_ms } of c.req.valid("json").tokens) {
        const written_at = new Date(c.var.arrivedAt - written_ago_ms).toISOString();
        const previous = latest.get(uid);
        if (!previous || written_at >= previous.written_at)
          latest.set(uid, { uid, kind, written_at });
      }
      return await withClaimsDeadline(
        c,
        deadlineMs,
        async (signal) => {
          const counts = await claims.uploadKinds([...latest.values()], signal);
          log("token_kinds_uploaded", { ...counts });
          return c.json(counts);
        },
        { token_writer: true },
      );
    });
}
