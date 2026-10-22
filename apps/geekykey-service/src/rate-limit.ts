import type { Context } from "hono";
import { log } from "./lib/log.ts";

/**
 * Who a limit turned away, as the `rate_limited` log line names them: a
 * station, by its ID when the copy of the registered stations already holds
 * its key's hash, and null when it doesn't, or a user, by user ID. Never a
 * key, or a key's hash, which finds the station as well as its key would.
 */
export type Caller = { station_id: string | null } | { user_id: string };

/**
 * The answer to a caller over a limit (the API agreement's section 2, "Rate
 * limits"): `429 rate_limited` with `Retry-After: 60`, and one `rate_limited`
 * log line naming `caller`.
 *
 * Each limit is a Workers Rate Limiting binding in wrangler.jsonc. Cloudflare
 * counts each one separately in each of its data centres, and its counts
 * catch up in the background, so a caller answered by several can sometimes
 * get past the limit. That's accepted: the limits guard against a runaway or
 * hostile sender, and aren't an exact count.
 */
export function rateLimited(c: Context, caller: Caller): Response {
  log("rate_limited", caller);
  return c.json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
}
