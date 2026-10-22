/**
 * A Workers Rate Limiting binding, faked with an exact count: each key's
 * first `limit` calls succeed, and every call after them fails, with no
 * window to roll over. Cloudflare's own count is only approximate, and kept
 * in each data centre (src/rate-limit.ts), so the tests that need an exact
 * 61st request use this. `keys` holds every key it was called with, in
 * order.
 */
export function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }: RateLimitOptions): Promise<RateLimitOutcome> {
      keys.push(key);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  } satisfies RateLimit & { keys: string[] };
}
