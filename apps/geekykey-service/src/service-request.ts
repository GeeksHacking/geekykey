import type { ZodType } from "zod";

/**
 * How the Worker sends a request out: `fetch`, unless a test fakes the
 * services it calls.
 */
export type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Why another service's answer couldn't be had, for the log line that says so. */
export type UnansweredReason = "timeout" | "unreachable" | "status" | "unparseable";

/**
 * Another service didn't answer properly in time. Each caller throws its own
 * kind, such as ClaimsUnavailable, so a route can tell them apart.
 */
export class Unanswered extends Error {
  override name = "Unanswered";
  readonly reason: UnansweredReason;
  /** The answer's status, when the reason is `status`. */
  readonly status: number | undefined;

  constructor(reason: UnansweredReason, status?: number) {
    super(status === undefined ? reason : `${reason} ${status}`);
    this.reason = reason;
    this.status = status;
  }
}

/**
 * One request to another service, with `key` as its bearer key, and the
 * answer checked against `answer`. Throws `fail`, a kind of Unanswered, for
 * anything but a 2xx whose body fits, or when `signal` fires first. There's
 * no retry. A fake `send` may not stop when its signal fires, so the wait for
 * its answer is cut short here too.
 *
 * `quickAnswer`, when given, is a plain check tried before `answer`, for an
 * answer big enough that Zod's own check costs too much CPU (see
 * quickTapsAnswer in event-service.ts). It returns what `answer` would, or
 * undefined for anything it isn't sure of, which `answer` then checks.
 */
export async function askService<T>(
  send: Send,
  {
    method,
    url,
    key,
    body,
    answer,
    quickAnswer,
    signal,
    fail,
  }: {
    method: "GET" | "POST";
    url: string;
    key: string;
    body?: unknown;
    answer: ZodType<T>;
    quickAnswer?: (value: unknown) => T | undefined;
    signal: AbortSignal;
    fail: new (reason: UnansweredReason, status?: number) => Unanswered;
  },
): Promise<T> {
  // Out of time already, so not worth asking.
  if (signal.aborted) throw new fail("timeout");
  const answered = (async () => {
    let res: Response;
    try {
      res = await send(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        // A redirect would carry the key wherever it points.
        redirect: "manual",
      });
    } catch {
      throw new fail(signal.aborted ? "timeout" : "unreachable");
    }
    // A 429, a 5xx, a redirect, or a 401 while the two sides' keys differ.
    if (!res.ok) throw new fail("status", res.status);
    const value: unknown = await res.json().catch(() => undefined);
    const quick = quickAnswer?.(value);
    if (quick !== undefined) return quick;
    const parsed = answer.safeParse(value);
    if (!parsed.success) throw new fail("unparseable");
    return parsed.data;
  })();
  return await beforeDeadline(answered, signal, () => new fail("timeout"));
}

/** `work`'s result, or `timedOut()` as soon as `signal` fires, whichever comes first. */
export function beforeDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timedOut: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const giveUp = () => reject(timedOut());
    if (signal.aborted) giveUp();
    signal.addEventListener("abort", giveUp, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", giveUp));
  });
}
