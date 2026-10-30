import { type HeartbeatsRequest, heartbeatsRequest, type TapsAnswer } from "@geekykey/handoff";
import { Hono } from "hono";
import { z } from "zod";
import { regexes } from "zod/v4/core";
import { errorFields, log } from "./lib/log.ts";
import { trustedTappedAt } from "./lib/tapped-at.ts";
import { normaliseUid, tokenUid, UID_PATTERN } from "./lib/token-uid.ts";
import { jsonBody } from "./lib/validate.ts";
import { type Claims, ClaimsUnavailable, type TokenOwner } from "./claims.ts";
import { type EventService, EventServiceUnavailable } from "./event-service.ts";
import { Unanswered } from "./service-request.ts";
import { stationAuth, type StationEnv } from "./station-auth.ts";
import type { StationsCopy } from "./stations-copy.ts";

export function tapBodySchema(maxTaps: number) {
  return z.object({
    taps: z
      .array(
        z.object({
          client_tap_id: z.string().min(1).max(128),
          uid: tokenUid,
          tapped_at: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .min(1)
      .max(maxTaps),
  });
}

/** The pattern `z.iso.datetime({ offset: true })` checks tapped_at with, from Zod itself. */
const TAPPED_AT_PATTERN = regexes.datetime({ offset: true });

/**
 * A plain check of a taps body, tried before tapBodySchema (lib/validate.ts).
 * It returns what the schema would, or undefined for anything it isn't sure
 * of, which the schema then checks as usual. So it never lets through a body
 * the schema would refuse, and a body that fails still gets Zod's issues.
 *
 * Why it's needed: GeeksHacking's Cloudflare account is on the Workers free
 * plan, which allows a request 10 ms of CPU time. On Cloudflare a 500-tap
 * batch used 9 to 63 ms (BAC-45, 19 Oct 2026), and most of that is spent
 * while a fresh isolate's V8 is still interpreting the code, which is most
 * isolates at our traffic. Profiled that way, Zod's check of the taps was
 * about three quarters of a batch's own work: it runs its general machinery
 * once for each of the 500 taps. This loop does the same checks in about a
 * tenth of the time. With it, the median batch on Cloudflare fell from 12 to
 * 15 ms to 6 to 7 ms. Keep it in step with tapBodySchema: the tests check
 * the two agree.
 */
export function quickTapBody(maxTaps: number) {
  return (value: unknown): TapBody | undefined => {
    if (!isObject(value) || !Array.isArray(value.taps)) return undefined;
    const raw: unknown[] = value.taps;
    if (raw.length < 1 || raw.length > maxTaps) return undefined;
    const taps: TapBody["taps"] = [];
    for (const tap of raw) {
      if (!isObject(tap)) return undefined;
      const { client_tap_id, uid, tapped_at } = tap;
      if (typeof client_tap_id !== "string" || client_tap_id.length < 1) return undefined;
      if (client_tap_id.length > 128) return undefined;
      if (typeof uid !== "string" || uid.length < 1 || uid.length > 64) return undefined;
      const normalised = normaliseUid(uid);
      if (!UID_PATTERN.test(normalised)) return undefined;
      if (tapped_at === undefined) {
        taps.push({ client_tap_id, uid: normalised });
      } else if (typeof tapped_at === "string" && TAPPED_AT_PATTERN.test(tapped_at)) {
        taps.push({ client_tap_id, uid: normalised, tapped_at });
      } else {
        return undefined;
      }
    }
    return { taps };
  };
}

type TapBody = z.output<ReturnType<typeof tapBodySchema>>;

/** An object read from JSON, as Zod's z.object() takes it: not null, and not an array. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * POST /  (mounted at /api/v1/taps)
 *
 * Station-authenticated batch ingest. Accepts one or many taps so live scans
 * and offline flushes share one code path. Returns a status per tap in request
 * order; firmware may drop a tap from its buffer once any status comes back.
 *
 * The request is counted against `stationLimit`, with the station's
 * heartbeats, and over it gets `429 rate_limited`. Then the key is checked
 * against `stationsCopy`, the stations each Event Service has registered,
 * within one deadline of `deadlineMs` that starts with the check
 * (station-auth.ts). A batch holds at most `maxTaps`.
 * Each token's owner comes from `claims`, in what's left of it. A tap by a
 * token nobody owns is answered `unknown_token` here and stored nowhere. The
 * rest are handed in one call, as their owners' taps, to the Event Service
 * that registered the station, in whatever is left of the deadline (the API
 * agreement's 11.2 and 11.5). When the owners can't be had in time, the whole
 * request fails with `503 claims_unavailable`, and when the hand-off isn't
 * answered properly in time, with `503 event_service_unavailable`. Either
 * way, the station keeps its taps to resend. Neither is retried.
 */
/** One tap's result, as the hand-off's answer and the station's have it. */
type TapResult = TapsAnswer["results"][number];

export function tapsRoutes({
  claims,
  stationsCopy,
  deadlineMs,
  maxTaps,
  stationLimit,
}: {
  claims: Claims;
  stationsCopy: StationsCopy<EventService>;
  deadlineMs: number;
  maxTaps: number;
  stationLimit: RateLimit;
}) {
  const auth = stationAuth(stationsCopy, deadlineMs, stationLimit);
  const body = jsonBody(tapBodySchema(maxTaps), quickTapBody(maxTaps));
  return new Hono<StationEnv>().post("/", auth, body, async (c) => {
    const { station, deadline } = c.var;
    const { eventService } = station;
    const { taps } = c.req.valid("json");

    let owners: Map<string, TokenOwner>;
    try {
      owners = await claims.ownersOf([...new Set(taps.map((t) => t.uid))], deadline);
    } catch (err) {
      if (!(err instanceof ClaimsUnavailable)) throw err;
      log("claims_unavailable", { station_id: station.id, reason: err.reason, status: err.status });
      return c.json({ error: "claims_unavailable" }, 503);
    }

    // What an Event Service answers is passed on unchanged: its status, even one of its own,
    // and with accepted or cooldown, the lines and complete its game gives (6.1).
    const results = Array.from<TapResult>({ length: taps.length });
    const claimed = taps.flatMap((tap, index) => {
      const owner = owners.get(tap.uid);
      if (owner !== undefined) return [{ index, tap, owner }];
      results[index] = { client_tap_id: tap.client_tap_id, status: "unknown_token" };
      log("unknown_token", {
        station_id: station.id,
        client_tap_id: tap.client_tap_id,
        uid: tap.uid,
      });
      return [];
    });

    if (claimed.length > 0) {
      const now = new Date();
      let handedOff;
      try {
        handedOff = await eventService.handOffTaps(
          {
            station_id: station.id,
            // The token's kind, never its UID (the agreement's 11.8).
            taps: claimed.map(({ tap, owner }) => ({
              client_tap_id: tap.client_tap_id,
              user_id: owner.userId,
              tapped_at: trustedTappedAt(tap.tapped_at, now),
              kind: owner.kind,
            })),
          },
          deadline,
        );
      } catch (err) {
        if (!(err instanceof EventServiceUnavailable)) throw err;
        log("handoff_failed", {
          station_id: station.id,
          event_service: eventService.id,
          reason: err.reason,
          status: err.status,
        });
        return c.json({ error: "event_service_unavailable" }, 503);
      }
      // One for one with `claimed`, in order, as handOffTaps checks.
      handedOff.forEach((result, i) => (results[claimed[i]!.index] = shownResult(result)));
    }

    // Deliberately no user IDs: readers must not hold PII (see RAMS, data privacy row). A
    // game's lines may name the participant, for the station's screen only (the agreement's 6.1).
    return c.json({ station_id: station.id, results });
  });
}

/** The statuses a station shows a game's lines with (the agreement's 6.1). */
const STATUSES_WITH_LINES = new Set(["accepted", "cooldown"]);

/**
 * A hand-off's result as the station gets it: as the Event Service gave it,
 * but with lines and complete only on accepted and cooldown. Any other
 * status, even another team's own, reaches the station without them.
 */
function shownResult(result: TapResult): TapResult {
  if (STATUSES_WITH_LINES.has(result.status)) return result;
  const { client_tap_id, status } = result;
  return { client_tap_id, status };
}

/**
 * A heartbeat's body: the station's own three fields, all optional, with the
 * rules the heartbeat hand-off passes them on with (the agreement's 6.2 and
 * 11.3).
 */
const heartbeatBody = heartbeatsRequest.omit({ station_id: true });

/**
 * POST /  (mounted at /api/v1/stations/heartbeat)
 *
 * The station's clock, and its health for the station board. It's counted
 * against `stationLimit` with the station's taps, and the key is checked as
 * a tap's is, so a key that can't be checked gets `503
 * event_service_unavailable`, and no time. Once it is, the answer is made,
 * and what the station said of its health is passed on to the Event Service
 * that registered it in `waitUntil`, after the answer has gone (the
 * agreement's 6.2 and 11.3). A hand-off that fails never fails the
 * heartbeat, so it sets the clock even while the Event Service is down.
 */
export function heartbeatRoutes({
  stationsCopy,
  deadlineMs,
  stationLimit,
}: {
  stationsCopy: StationsCopy<EventService>;
  deadlineMs: number;
  stationLimit: RateLimit;
}) {
  return new Hono<StationEnv>().post(
    "/",
    stationAuth(stationsCopy, deadlineMs, stationLimit),
    jsonBody(heartbeatBody),
    (c) => {
      const { station, deadline, waitUntil } = c.var;
      const answer = { station_id: station.id, server_time: new Date().toISOString() };
      waitUntil(
        passOnHeartbeat(
          station.eventService,
          { station_id: station.id, ...c.req.valid("json") },
          deadline,
        ),
      );
      return c.json(answer);
    },
  );
}

/**
 * The heartbeat hand-off, within what's left of the station request's
 * deadline, with no retry: a lost one is replaced a minute later. Never
 * throws: a failure is logged.
 */
async function passOnHeartbeat(
  eventService: EventService,
  request: HeartbeatsRequest,
  deadline: AbortSignal,
) {
  try {
    await eventService.handOffHeartbeat(request, deadline);
  } catch (err) {
    log("heartbeat_handoff_failed", {
      station_id: request.station_id,
      event_service: eventService.id,
      ...(err instanceof Unanswered
        ? { reason: err.reason, status: err.status }
        : errorFields(err)),
    });
  }
}
