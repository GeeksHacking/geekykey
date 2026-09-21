import { and, eq, inArray, sql } from "drizzle-orm";
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
    const receivedAt = this.#now().toISOString();
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
      const tappedAt = tap.tappedAt
        ? new Date(tap.tappedAt).toISOString()
        : null;
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

    // 3. Cooldown: compare each known user's tap with their latest accepted tap at this station,
    //    then walk this batch in time order so offline flushes are judged by when taps happened.
    const knownUserIds = [
      ...new Set(pending.flatMap((p) => (p.userId ? [p.userId] : []))),
    ];
    const lastAccepted = await this.#lastAcceptedAt(stationId, knownUserIds);
    const inTimeOrder = [...pending].sort((a, b) =>
      a.effectiveAt.localeCompare(b.effectiveAt)
    );
    for (const p of inTimeOrder) {
      if (p.userId === null) continue;
      const last = lastAccepted.get(p.userId);
      if (last !== undefined && this.#withinCooldown(last, p.effectiveAt)) {
        p.status = "cooldown";
        continue;
      }
      p.status = "accepted";
      lastAccepted.set(p.userId, p.effectiveAt);
    }

    // 4. One write round trip. Conflict-ignore absorbs a concurrent replay racing this request.
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

  async #lastAcceptedAt(
    stationId: string,
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.#db
      .select({
        userId: taps.userId,
        lastAt: sql<
          string
        >`max(coalesce(${taps.tappedAt}, ${taps.receivedAt}))`,
      })
      .from(taps)
      .where(
        and(
          eq(taps.stationId, stationId),
          eq(taps.status, "accepted"),
          inArray(taps.userId, userIds),
        ),
      )
      .groupBy(taps.userId);
    return new Map(
      rows.flatMap((
        row,
      ) => (row.userId ? [[row.userId, row.lastAt] as const] : [])),
    );
  }
}
