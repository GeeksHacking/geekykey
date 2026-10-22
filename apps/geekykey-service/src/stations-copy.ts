import type { RegisteredStation } from "@geekykey/handoff";
import { errorFields, log } from "./lib/log.ts";
import { beforeDeadline, Unanswered } from "./service-request.ts";

/** An Event Service, as the copy asks it for its registered stations. */
export interface StationsSource {
  /** Its ID in EVENT_SERVICES, which log lines name it by. */
  readonly id: string;
  registeredStations(signal: AbortSignal): Promise<RegisteredStation[]>;
}

/** A station on the copy: its ID, and the Event Service that registered it. */
export interface FoundStation<S extends StationsSource> {
  stationId: string;
  /** Which its taps go to. */
  eventService: S;
}

/** Runs `work` after the request has its answer, as a Worker's `ctx.waitUntil()` does. */
export type WaitUntil = (work: Promise<unknown>) => void;

/** How long after asking an Event Service for its list the copy asks again, on any key. */
const MAX_AGE_MS = 60_000;

/**
 * What the copy says about a station key's hash: on one Event Service's list,
 * on none of them, or on none of those in hand while another is missing.
 */
export type KeyCheck<S extends StationsSource> =
  | ({ result: "found" } & FoundStation<S>)
  | { result: "unknown" }
  | { result: "unavailable" };

/**
 * The GeekyKey Service's copy of the stations each Event Service has
 * registered, kept in memory (the migration spec's 3.5).
 */
export class StationsCopy<S extends StationsSource> {
  #eventServices: S[];
  #now: () => number;
  #fetchTimeoutMs: number;
  /** Each Event Service's last good list, by its ID. */
  #lists = new Map<string, RegisteredStation[]>();
  /** When each Event Service was last asked for its list, by its ID, whatever came back. */
  #askedAt = new Map<string, number>();
  /** Each Event Service's request for its list, by its ID, while one is out. */
  #asking = new Map<string, Promise<void>>();
  #byKeyHash = new Map<string, FoundStation<S>>();
  /** The stations refused for appearing twice, as `[event service, station ID, reason]` JSON. */
  #refused = new Set<string>();

  constructor({
    eventServices,
    now,
    fetchTimeoutMs,
  }: {
    eventServices: S[];
    now: () => number;
    fetchTimeoutMs: number;
  }) {
    this.#eventServices = eventServices;
    this.#now = now;
    this.#fetchTimeoutMs = fetchTimeoutMs;
  }

  async find(
    keyHash: string,
    { signal, waitUntil }: { signal: AbortSignal; waitUntil: WaitUntil },
  ): Promise<KeyCheck<S>> {
    let hit = this.#byKeyHash.get(keyHash);
    if (hit === undefined) {
      // A request already out costs nothing to join, but a list asked for in
      // the last minute isn't asked for again, so junk keys can't make us
      // call an Event Service that's down.
      const due = this.#missing().filter(({ id }) => this.#asking.has(id) || this.#stale(id));
      if (due.length > 0) await this.#fill(due, signal, waitUntil);
      hit = this.#byKeyHash.get(keyHash);
    }
    // Found or not, so a new station's key works within a minute even when
    // it's the only one tapping (the API agreement's 9.7).
    this.#refresh(waitUntil);
    if (hit !== undefined) return { result: "found", ...hit };
    return this.#missing().length === 0 ? { result: "unknown" } : { result: "unavailable" };
  }

  /**
   * The station with `keyHash` on the lists already in hand, without asking
   * any Event Service for one: who a request is from before its key is
   * checked, for a log line.
   */
  peek(keyHash: string): FoundStation<S> | undefined {
    return this.#byKeyHash.get(keyHash);
  }

  /** The Event Services whose list the copy has never had. */
  #missing(): S[] {
    return this.#eventServices.filter(({ id }) => !this.#lists.has(id));
  }

  /**
   * Asks each Event Service last asked more than a minute ago for its list
   * again, without waiting for the answers, each on its own.
   */
  #refresh(waitUntil: WaitUntil) {
    for (const eventService of this.#eventServices) {
      if (this.#stale(eventService.id)) waitUntil(this.#ask(eventService));
    }
  }

  /** Whether the Event Service was never asked for its list, or last asked more than a minute ago. */
  #stale(id: string): boolean {
    const askedAt = this.#askedAt.get(id);
    return askedAt === undefined || this.#now() - askedAt > MAX_AGE_MS;
  }

  /**
   * Asks each of `eventServices` for its list, on a station's request, and
   * waits for the answers until `signal` fires. A list that comes later is
   * still kept.
   */
  async #fill(eventServices: S[], signal: AbortSignal, waitUntil: WaitUntil) {
    const started = this.#now();
    const asked = Promise.all(eventServices.map((eventService) => this.#ask(eventService)));
    waitUntil(asked);
    await beforeDeadline(asked, signal, () => new Error("timeout")).catch(() => {});
    log("stations_copy_filled", {
      took_ms: this.#now() - started,
      complete: this.#missing().length === 0,
      missing: this.#missing().map(({ id }) => id),
    });
  }

  /**
   * Asks `eventService` for its list, or joins the request already out, and
   * keeps what comes back. Never throws: a failure is logged, and the last
   * good list stays.
   */
  #ask(eventService: S): Promise<void> {
    const out = this.#asking.get(eventService.id);
    if (out !== undefined) return out;
    this.#askedAt.set(eventService.id, this.#now());
    const asking = (async () => {
      try {
        const list = await eventService.registeredStations(
          AbortSignal.timeout(this.#fetchTimeoutMs),
        );
        this.#lists.set(eventService.id, list);
        this.#index();
      } catch (err) {
        log("stations_unavailable", {
          event_service: eventService.id,
          ...(err instanceof Unanswered
            ? { reason: err.reason, status: err.status }
            : errorFields(err)),
        });
      }
    })().finally(() => this.#asking.delete(eventService.id));
    this.#asking.set(eventService.id, asking);
    return asking;
  }

  /**
   * Rebuilds the lookup by key hash from every list in hand. A station whose
   * ID or key hash appears twice, in one list or in two, is left out, so
   * neither station works until it's fixed (the API agreement's 11.1). Each
   * refusal is logged once, while it lasts.
   */
  #index() {
    const stations = this.#eventServices.flatMap((eventService) =>
      (this.#lists.get(eventService.id) ?? []).map((station) => ({ ...station, eventService })),
    );
    const count = (values: string[]) => {
      const counts = new Map<string, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    };
    const ids = count(stations.map((station) => station.station_id));
    const hashes = count(stations.map((station) => station.key_hash));

    const byKeyHash = new Map<string, FoundStation<S>>();
    const refused = new Set<string>();
    for (const { station_id, key_hash, eventService } of stations) {
      const reason =
        ids.get(station_id)! > 1
          ? "duplicate_station_id"
          : hashes.get(key_hash)! > 1
            ? "duplicate_key_hash"
            : undefined;
      if (reason === undefined) {
        byKeyHash.set(key_hash, { stationId: station_id, eventService });
        continue;
      }
      const refusal = JSON.stringify([eventService.id, station_id, reason]);
      refused.add(refusal);
      // Never the hash, which finds the station as well as its key would.
      if (!this.#refused.has(refusal)) {
        log("station_refused", { event_service: eventService.id, station_id, reason });
      }
    }
    this.#byKeyHash = byKeyHash;
    this.#refused = refused;
  }
}
