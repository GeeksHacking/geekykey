import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/** The key in an `Authorization: Bearer <key>` header, or null when the header isn't one. */
export function bearerKey(header: string | undefined): string | null {
  const [scheme, key, ...rest] = (header ?? "").trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !key || rest.length > 0) return null;
  return key;
}

/**
 * Lets a request through only when it carries `Authorization: Bearer <key>`,
 * for the keys one area's requests to another carry. Anything else gets 401
 * with `error`. The two keys' SHA-256 hashes are compared, in constant time,
 * so how long the check takes says nothing about the key, not even its length.
 */
export function requireBearerKey(key: string, error: string): MiddlewareHandler {
  const expected = sha256(key);
  return async (c, next) => {
    const given = bearerKey(c.req.header("Authorization"));
    if (given === null || !timingSafeEqual(sha256(given), expected)) {
      return c.json({ error }, 401);
    }
    return next();
  };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
