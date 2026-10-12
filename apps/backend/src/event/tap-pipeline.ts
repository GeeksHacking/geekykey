import { and, between, eq, inArray, sql } from "drizzle-orm";
import { normaliseUid, type TokenResolver } from "../claims-stand-in/token-lookup.ts";
import type { Db } from "../db/pool.ts";
import {
  type NewTap,
  type STORED_TAP_STATUSES,
  stations,
  type TAP_SOURCES,
  taps,
} from "./schema.ts";

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

/** The database inside one ingest's transaction. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
 * Designed for a remote database: one read for tokens, then one short
 * transaction that locks the station's row, reads existing IDs and cooldown
 * state, and makes a single multi-row insert. Every non-duplicate tap is
 * stored, including rejected ones, so organisers can see unknown tags and
 * repeat taps in the log.
 *
 * It still takes the claims stand-in's token lookup. Later in checkpoint 3 it
 * is handed user IDs instead, and never sees a token.
 */
export class TapPipeline {
  #db: Db;
  #tokens: TokenResolver;
  #cooldownMs: number;
  #now: () => Date;

  constructor(db: Db, tokens: TokenResolver, options: TapPipelineOptions) {
    this.#db = db;
    this.#tokens = tokens;
    this.#cooldownMs = options.cooldownSeconds * 1000;
    this.#now = options.now ?? (() => new Date());
  }

  async ingest(
    stationId: string,
    incoming: IncomingTap[],
    source: TapSource = "nfc",
  ): Promise<TapResult[]> {
    if (incoming.length === 0) return [];
    const now = this.#now();
    const receivedAt = now.toISOString();

    // Token to user, before the transaction, so the station's lock never waits on it.
    const users = await this.#tokens.resolveMany([
      ...new Set(incoming.map((t) => normaliseUid(t.uid))),
    ]);

    return await this.#db.transaction(async (tx) => {
      await this.#lockStation(tx, stationId);
      const results = Array.from<TapResult>({ length: incoming.length });

      // 1. Replays: client IDs already stored for this station, or repeated within this request.
      const existing = await this.#existingClientTapIds(
        tx,
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
        const uid = normaliseUid(tap.uid);
        const tappedAt = this.#trustedTappedAt(tap.tappedAt, now);
        pending.push({
          index,
          clientTapId: tap.clientTapId,
          uid,
          tappedAt,
          effectiveAt: tappedAt ?? receivedAt,
          userId: users.get(uid) ?? null,
          status: "unknown_token",
        });
      });
      if (pending.length === 0) return results;

      // 2. Cooldown: a known user's tap is `cooldown` when one of their accepted taps at this
      //    station, stored or earlier in this batch, is inside the window on either side of it.
      //    Walking the batch in time order means an offline flush is judged by when taps happened.
      const accepted = await this.#acceptedTimes(tx, stationId, pending);
      const inTimeOrder = [...pending].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
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

      // 3. One write round trip. With the lock held, no row here can already exist; the no-op
      //    update is only so that one never fails the batch. Never INSERT IGNORE, which would
      //    also store bad values without a word.
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
      await tx
        .insert(taps)
        .values(rows)
        .onDuplicateKeyUpdate({
          set: { id: sql`id` },
        });

      for (const p of pending) {
        results[p.index] = {
          clientTapId: p.clientTapId,
          status: p.status,
          userId: p.userId,
        };
      }
      return results;
    });
  }

  /**
   * Makes one station's ingests take turns, even across Cloud Run instances:
   * each reads, decides, then writes, so two at once would miss each other's
   * rows. A resend racing its original would get `accepted` twice, and two
   * taps by one participant would both beat the cooldown. The lock is held
   * until the transaction ends.
   *
   * Taking turns isn't enough on its own. On TiDB, a plain read inside a
   * transaction sees the database as it was before the lock was waited for,
   * so it would still miss the taps the ingest before stored. That's why the
   * reads after the lock are locking reads (`FOR UPDATE`) too: a locking read
   * sees the latest rows. (READ COMMITTED would also do it, but Drizzle sets it
   * with a statement of its own before BEGIN, and the locking reads need
   * nothing set.)
   */
  async #lockStation(tx: Tx, stationId: string): Promise<void> {
    await tx
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, stationId))
      .for("update");
  }

  /** The device time as ISO 8601, or null when it is missing or too far from the server's clock. */
  #trustedTappedAt(tappedAt: string | undefined, now: Date): string | null {
    if (!tappedAt) return null;
    const at = Date.parse(tappedAt);
    const drift = at - now.getTime();
    if (Number.isNaN(at) || drift > MAX_CLOCK_AHEAD_MS || -drift > MAX_TAP_AGE_MS) {
      return null;
    }
    return new Date(at).toISOString();
  }

  #withinCooldown(a: string, b: string): boolean {
    if (this.#cooldownMs <= 0) return false;
    return Math.abs(Date.parse(a) - Date.parse(b)) < this.#cooldownMs;
  }

  async #existingClientTapIds(
    tx: Tx,
    stationId: string,
    clientTapIds: string[],
  ): Promise<Set<string>> {
    const rows = await tx
      .select({ clientTapId: taps.clientTapId })
      .from(taps)
      .where(
        and(eq(taps.stationId, stationId), inArray(taps.clientTapId, [...new Set(clientTapIds)])),
      )
      // To see the latest rows. See #lockStation.
      .for("update");
    return new Set(rows.map((row) => row.clientTapId));
  }

  /**
   * Times of the stored accepted taps at this station, per user, that are
   * close enough to some tap in `pending` to put it in cooldown. Fetching
   * every nearby tap, not just the latest, matters for a late offline flush:
   * its taps sit between ones already stored.
   */
  async #acceptedTimes(
    tx: Tx,
    stationId: string,
    pending: PendingTap[],
  ): Promise<Map<string, string[]>> {
    const known = pending.flatMap((p) =>
      p.userId ? [{ userId: p.userId, at: Date.parse(p.effectiveAt) }] : [],
    );
    if (known.length === 0 || this.#cooldownMs <= 0) return new Map();

    const times = known.map((k) => k.at);
    const from = new Date(Math.min(...times) - this.#cooldownMs).toISOString();
    const to = new Date(Math.max(...times) + this.#cooldownMs).toISOString();
    const effectiveAt = sql<string>`coalesce(${taps.tappedAt}, ${taps.receivedAt})`;

    const rows = await tx
      .select({ userId: taps.userId, at: effectiveAt })
      .from(taps)
      .where(
        and(
          eq(taps.stationId, stationId),
          eq(taps.status, "accepted"),
          inArray(taps.userId, [...new Set(known.map((k) => k.userId))]),
          between(effectiveAt, from, to),
        ),
      )
      // To see the latest rows. See #lockStation.
      .for("update");

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.userId) continue;
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.at]);
    }
    return byUser;
  }
}
