import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  type NewTap,
  STORED_TAP_STATUSES,
  TAP_SOURCES,
  taps,
} from "../db/schema.ts";
import { normaliseUid, type TokenResolver } from "./identity.ts";

export type TapSource = (typeof TAP_SOURCES)[number];
export type StoredTapStatus = (typeof STORED_TAP_STATUSES)[number];
/** `duplicate` is returned for replays of a client_tap_id already stored; it is never written. */
export type TapResultStatus = StoredTapStatus | "duplicate";

export interface IncomingTap {
  /** Station-generated ID that makes retries idempotent. Unique per station. */
  clientTapId: string;
  uid: string;
  /** Device clock time of the tap, ISO 8601. Optional because ESP32 clocks are unreliable. */
  tappedAt?: string;
}

export interface TapResult {
  clientTapId: string;
  status: TapResultStatus;
  userId: string | null;
}

export interface TapPipelineOptions {
  cooldownSeconds: number;
  now?: () => Date;
}

/**
 * A device tapped_at further than this from the server's clock is treated as
 * absent, and the tap is judged by its receipt time instead. An ESP32 that
 * never synced its clock reports 1970, and one wild timestamp would otherwise
 * skew that participant's cooldown at the station for good.
 */
const MAX_TAP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // an offline buffer may wait days to flush
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000; // a synced clock can still run a little fast

interface PendingTap {
  index: number;
  clientTapId: string;
  uid: string;
  tappedAt: string | null;
  /** Time used for ordering and cooldown: device time when given, else server receipt time. */
  effectiveAt: string;
  userId: string | null;
  status: StoredTapStatus;
}

/**
 * Ingests a batch of taps from one station.
 *
 * Designed for a remote database: one read for existing IDs, one for tokens,
 * one for cooldown state, then a single multi-row insert. Every non-duplicate
 * tap is stored, including rejected ones, so organisers can see unknown tags
 * and repeat taps in the log.
 */
export class TapPipeline {
  #db: Db;
  #tokens: TokenResolver;
  #cooldownMs: number;
  #now: () => Date;
  /** The last ingest queued for each station. See #oneAtATime. */
  #queues = new Map<string, Promise<unknown>>();

  constructor(db: Db, tokens: TokenResolver, options: TapPipelineOptions) {
    this.#db = db;
    this.#tokens = tokens;
    this.#cooldownMs = options.cooldownSeconds * 1000;
    this.#now = options.now ?? (() => new Date());
  }

  ingest(
    stationId: string,
    incoming: IncomingTap[],
    source: TapSource = "nfc",
  ): Promise<TapResult[]> {
    return this.#oneAtATime(
      stationId,
      () => this.#ingest(stationId, incoming, source),
    );
  }

  async #ingest(
    stationId: string,
    incoming: IncomingTap[],
    source: TapSource,
  ): Promise<TapResult[]> {
    if (incoming.length === 0) return [];
    const now = this.#now();
    const receivedAt = now.toISOString();
    const results: TapResult[] = new Array(incoming.length);

    // 1. Replays: client IDs already stored for this station, or repeated within this request.
    const existing = await this.#existingClientTapIds(
      stationId,
      incoming.map((t) => t.clientTapId),
    );
    const seen = new Set<string>();
    const pending: PendingTap[] = [];
    incoming.forEach((tap, index) => {
      if (existing.has(tap.clientTapId) || seen.has(tap.clientTapId)) {
        results[index] = {
          clientTapId: tap.clientTapId,
          status: "duplicate",
          userId: null,
        };
        return;
      }
      seen.add(tap.clientTapId);
      const tappedAt = this.#trustedTappedAt(tap.tappedAt, now);
      pending.push({
        index,
        clientTapId: tap.clientTapId,
        uid: normaliseUid(tap.uid),
        tappedAt,
        effectiveAt: tappedAt ?? receivedAt,
        userId: null,
        status: "unknown_token",
      });
    });
    if (pending.length === 0) return results;

    // 2. Token to user.
    const users = await this.#tokens.resolveMany([
      ...new Set(pending.map((p) => p.uid)),
    ]);
    for (const p of pending) p.userId = users.get(p.uid) ?? null;

    // 3. Cooldown: a known user's tap is `cooldown` when one of their accepted taps at this
    //    station, stored or earlier in this batch, is inside the window on either side of it.
    //    Walking the batch in time order means an offline flush is judged by when taps happened.
    const accepted = await this.#acceptedTimes(stationId, pending);
    const inTimeOrder = [...pending].sort((a, b) =>
      a.effectiveAt.localeCompare(b.effectiveAt)
    );
    for (const p of inTimeOrder) {
      if (p.userId === null) continue;
      const times = accepted.get(p.userId) ?? [];
      if (times.some((at) => this.#withinCooldown(at, p.effectiveAt))) {
        p.status = "cooldown";
        continue;
      }
      p.status = "accepted";
      times.push(p.effectiveAt);
      accepted.set(p.userId, times);
    }

    // 4. One write round trip. Conflict-ignore keeps (station, client_tap_id) unique, but it
    //    does not correct the statuses decided above: a replay racing in on another instance
    //    would still come back `accepted`. That is why #oneAtATime notes the database lock.
    const rows: NewTap[] = pending.map((p) => ({
      stationId,
      clientTapId: p.clientTapId,
      tokenUid: p.uid,
      userId: p.userId,
      source,
      status: p.status,
      tappedAt: p.tappedAt,
      receivedAt,
    }));
    await this.#db.insert(taps).values(rows).onConflictDoNothing();

    for (const p of pending) {
      results[p.index] = {
        clientTapId: p.clientTapId,
        status: p.status,
        userId: p.userId,
      };
    }
    return results;
  }

  /**
   * Runs one station's ingests one after another. Each ingest reads, decides,
   * then writes, so two overlapping requests from the same station would miss
   * each other's rows: a retry racing its original would get `accepted` twice,
   * and two taps by one participant would both beat the cooldown.
   *
   * This only orders requests inside one process. Once the backend runs on
   * several Workers instances, the same guarantee needs a database lock, such
   * as `SELECT ... FOR UPDATE` on the station row inside a transaction.
   */
  async #oneAtATime<T>(stationId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(stationId) ?? Promise.resolve();
    const current = previous.then(run);
    // The next ingest waits for this one, whether it succeeds or fails.
    const tail = current.catch(() => {});
    this.#queues.set(stationId, tail);
    try {
      return await current;
    } finally {
      // Nothing queued behind this one, so drop the entry rather than keep one per station forever.
      if (this.#queues.get(stationId) === tail) this.#queues.delete(stationId);
    }
  }

  /** The device time as ISO 8601, or null when it is missing or too far from the server's clock. */
  #trustedTappedAt(tappedAt: string | undefined, now: Date): string | null {
    if (!tappedAt) return null;
    const at = Date.parse(tappedAt);
    const drift = at - now.getTime();
    if (
      Number.isNaN(at) || drift > MAX_CLOCK_AHEAD_MS || -drift > MAX_TAP_AGE_MS
    ) {
      return null;
    }
    return new Date(at).toISOString();
  }

  #withinCooldown(a: string, b: string): boolean {
    if (this.#cooldownMs <= 0) return false;
    return Math.abs(Date.parse(a) - Date.parse(b)) < this.#cooldownMs;
  }

  async #existingClientTapIds(
    stationId: string,
    clientTapIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.#db
      .select({ clientTapId: taps.clientTapId })
      .from(taps)
      .where(
        and(
          eq(taps.stationId, stationId),
          inArray(taps.clientTapId, [...new Set(clientTapIds)]),
        ),
      );
    return new Set(rows.map((row) => row.clientTapId));
  }

  /**
   * Times of the stored accepted taps at this station, per user, that are
   * close enough to some tap in `pending` to put it in cooldown. Fetching
   * every nearby tap, not just the latest, matters for a late offline flush:
   * its taps sit between ones already stored.
   */
  async #acceptedTimes(
    stationId: string,
    pending: PendingTap[],
  ): Promise<Map<string, string[]>> {
    const known = pending.flatMap((p) =>
      p.userId ? [{ userId: p.userId, at: Date.parse(p.effectiveAt) }] : []
    );
    if (known.length === 0 || this.#cooldownMs <= 0) return new Map();

    const times = known.map((k) => k.at);
    const from = new Date(Math.min(...times) - this.#cooldownMs).toISOString();
    const to = new Date(Math.max(...times) + this.#cooldownMs).toISOString();
    const effectiveAt = sql<
      string
    >`coalesce(${taps.tappedAt}, ${taps.receivedAt})`;

    const rows = await this.#db
      .select({ userId: taps.userId, at: effectiveAt })
      .from(taps)
      .where(
        and(
          eq(taps.stationId, stationId),
          eq(taps.status, "accepted"),
          inArray(taps.userId, [...new Set(known.map((k) => k.userId))]),
          between(effectiveAt, from, to),
        ),
      );

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.userId) continue;
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.at]);
    }
    return byUser;
  }
}
