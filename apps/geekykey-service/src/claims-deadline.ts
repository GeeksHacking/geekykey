import type { Context } from "hono";
import { ClaimsUnavailable } from "./claims.ts";
import { log } from "./lib/log.ts";
import type { SessionEnv } from "./session.ts";

/**
 * The answer to a user's request that asks the claims (the API agreement's
 * 8.2 to 8.5). `answer` gets one signal for every call it makes to Claims,
 * so they share one deadline, as section 8's opening has it. When the claims
 * stand-in doesn't answer properly within it, the request answers
 * `503 claims_unavailable` instead and writes a `claims_unavailable` log
 * line, and the screens say "Couldn't reach GeeksHacking. Try again."
 *
 * Called in a handler after requireSession, which sets the user ID the log
 * line names.
 */
export async function withClaimsDeadline(
  c: Context<SessionEnv>,
  deadlineMs: number,
  answer: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  try {
    return await answer(AbortSignal.timeout(deadlineMs));
  } catch (err) {
    if (!(err instanceof ClaimsUnavailable)) throw err;
    log("claims_unavailable", { user_id: c.var.userId, reason: err.reason, status: err.status });
    return c.json({ error: "claims_unavailable" }, 503);
  }
}
