import {
  type RegisteredStation,
  stationsAnswer,
  type TapsAnswer,
  tapsAnswerMatching,
  type TapsRequest,
} from "@geekykey/handoff";
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
 * One Event Service, as the GeekyKey side asks it: the API agreement's
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
      signal,
      fail: EventServiceUnavailable,
    });
    return results;
  }
}
