import {
  type HeartbeatsRequest,
  LINE_PATTERN,
  MAX_LINES,
  meetingsAnswer,
  type MeetingsAnswer,
  type MeetingsRequest,
  type RegisteredStation,
  stationsAnswer,
  type TapsAnswer,
  tapsAnswerMatching,
  type TapsRequest,
  usedLoginLinksAnswer,
  type UsedLoginLinksRequest,
} from "@geekykey/handoff";
import { z } from "zod";
import { askService, type Send, Unanswered } from "./service-request.ts";

/**
 * The station's Event Service didn't answer the hand-off properly in time. A
 * station request answers it with `503 event_service_unavailable`, and the
 * station keeps its taps to resend.
 */
export class EventServiceUnavailable extends Unanswered {
  override name = "EventServiceUnavailable";
}

/**
 * One Event Service, as the Worker asks it: the API agreement's
 * section 11, with the shapes in packages/handoff and its Event Service key.
 */
export class EventService {
  /** Its ID in EVENT_SERVICES, which log lines name it by. */
  readonly id: string;
  #url: string;
  #key: string;
  #send: Send;

  /** `url` is where its routes start, such as `https://event-api.geekshacking.com`. */
  constructor({ id, url, key, send }: { id: string; url: string; key: string; send: Send }) {
    this.id = id;
    this.#url = url;
    this.#key = key;
    this.#send = send;
  }

  /**
   * Its registered stations (11.1): the enabled ones, each with its key's
   * hash. Throws EventServiceUnavailable for anything else, or when `signal`
   * fires first. There's no retry: the copy asks again a minute later.
   */
  async registeredStations(signal: AbortSignal): Promise<RegisteredStation[]> {
    const { stations } = await askService(this.#send, {
      method: "GET",
      url: `${this.#url}/geekykey/v1/stations`,
      key: this.#key,
      answer: stationsAnswer,
      signal,
      fail: EventServiceUnavailable,
    });
    return stations;
  }

  /**
   * The hand-off (11.2): a station's taps, each by its owner, in one call.
   * The results come back in request order, one per tap. Throws
   * EventServiceUnavailable for anything else, or when `signal` fires first.
   * There's no retry: a station resends, and the Event Service answers
   * `duplicate` to any tap it already stored.
   */
  async handOffTaps(request: TapsRequest, signal: AbortSignal): Promise<TapsAnswer["results"]> {
    const { results } = await askService(this.#send, {
      method: "POST",
      url: `${this.#url}/geekykey/v1/taps`,
      key: this.#key,
      body: request,
      answer: tapsAnswerMatching(request),
      quickAnswer: quickTapsAnswer(request),
      signal,
      fail: EventServiceUnavailable,
    });
    return results;
  }

  /**
   * The heartbeat hand-off (11.3): what a station's heartbeat said of its
   * health. Any 2xx will do, since ours answers `204` with no body, which
   * askService reads as undefined and z.unknown() takes. Throws
   * EventServiceUnavailable for anything else, or when `signal` fires first.
   * There's no retry: the station's next heartbeat comes a minute later.
   */
  async handOffHeartbeat(request: HeartbeatsRequest, signal: AbortSignal): Promise<void> {
    await askService(this.#send, {
      method: "POST",
      url: `${this.#url}/geekykey/v1/heartbeats`,
      key: this.#key,
      body: request,
      answer: z.unknown(),
      signal,
      fail: EventServiceUnavailable,
    });
  }

  /**
   * The meeting hand-off (11.10): one half of a connection, which only an
   * Event Service whose entry takes meetings is sent. Gives its status and
   * the owner's name, which is null from an Event Service from before names.
   * Throws EventServiceUnavailable for anything else, or when `signal`
   * fires first, and its reason `status` with 404 is an Event Service from
   * before meetings. There's no retry: tapping the token again sends the
   * half again, which does no harm.
   */
  async handOffMeeting(request: MeetingsRequest, signal: AbortSignal): Promise<MeetingsAnswer> {
    return await askService(this.#send, {
      method: "POST",
      url: `${this.#url}/geekykey/v1/meetings`,
      key: this.#key,
      body: request,
      answer: meetingsAnswer,
      signal,
      fail: EventServiceUnavailable,
    });
  }

  /**
   * Marks a login link to the GeekyKey screens used (11.11), which only an
   * Event Service whose entry says `login_links_to_geekykey` is sent. Gives
   * true for the link's first use, and false after, which logs nobody in.
   * Throws EventServiceUnavailable for anything else, or when `signal` fires
   * first, and its reason `status` with 404 is an Event Service from before
   * BAC-157. There's no retry: the screens ask the event for a new link.
   */
  async markLoginLinkUsed(request: UsedLoginLinksRequest, signal: AbortSignal): Promise<boolean> {
    const { first_use } = await askService(this.#send, {
      method: "POST",
      url: `${this.#url}/geekykey/v1/used-login-links`,
      key: this.#key,
      body: request,
      answer: usedLoginLinksAnswer,
      signal,
      fail: EventServiceUnavailable,
    });
    return first_use;
  }
}

/** The pattern tapsAnswer checks each status with, in @geekykey/handoff. */
const STATUS_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Whether `lines` are a result's lines as tapsAnswer takes them. */
function isLines(lines: unknown): lines is string[] {
  return (
    Array.isArray(lines) &&
    lines.length >= 1 &&
    lines.length <= MAX_LINES &&
    lines.every((line) => typeof line === "string" && LINE_PATTERN.test(line))
  );
}

/**
 * A plain check of the hand-off's answer, tried before tapsAnswerMatching
 * (service-request.ts). It returns what the schema would, or undefined for
 * anything it isn't sure of, which the schema then checks as usual. So it
 * never takes an answer the schema would refuse.
 *
 * It's needed for the same reason as quickTapBody in station-routes.ts: on
 * the Workers free plan a request has 10 ms of CPU, and Zod checking 500
 * results one by one costs several times what this loop does while V8 is
 * still interpreting the code, as it is in most isolates at our traffic
 * (BAC-45). Keep it in step with tapsAnswer and tapsAnswerMatching: the
 * tests check they agree.
 */
export function quickTapsAnswer(request: TapsRequest) {
  return (value: unknown): TapsAnswer | undefined => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const raw: unknown = (value as Record<string, unknown>).results;
    if (!Array.isArray(raw) || raw.length !== request.taps.length) return undefined;
    const results: TapsAnswer["results"] = [];
    for (const [i, result] of raw.entries()) {
      if (typeof result !== "object" || result === null || Array.isArray(result)) return undefined;
      const { client_tap_id, status, lines, complete } = result as Record<string, unknown>;
      if (client_tap_id !== request.taps[i]!.client_tap_id) return undefined;
      if (typeof status !== "string" || !STATUS_PATTERN.test(status)) return undefined;
      const checked: TapsAnswer["results"][number] = { client_tap_id, status };
      if (lines !== undefined) {
        if (!isLines(lines)) return undefined;
        checked.lines = lines;
      }
      if (complete !== undefined) {
        if (typeof complete !== "boolean") return undefined;
        checked.complete = complete;
      }
      results.push(checked);
    }
    return { results };
  };
}
