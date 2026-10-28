import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { trustedTappedAt } from "../lib/tapped-at.ts";
import {
  combinedStatus,
  type GameContext,
  type GameOnStations,
  type GameStatus,
  type GameTap,
  runsAt,
  type Tx,
} from "./games.ts";
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
  /** The token's owner. A tap by a token nobody owns never gets this far. */
  userId: string;
  /** Device clock time of the tap, ISO 8601. Optional because ESP32 clocks are unreliable. */
  tappedAt?: string | null;
}

export interface TapResult {
  clientTapId: string;
  status: TapResultStatus;
  userId: string | null;
}

export interface TapPipelineOptions {
  cooldownSeconds: number;
  /** The games this event runs, from its settings (src/showcase/games.ts). */
  games: readonly GameOnStations[];
  now?: () => Date;
}

/** The taps were for a station that isn't one of this Event Service's. Nothing was written. */
export class UnknownStation extends Error {
  override name = "UnknownStation";
}

interface PendingTap extends GameTap {
  index: number;
  status: StoredTapStatus;
}

/**
 * Ingests a batch of taps from one station, each by a token's owner.
 *
 * Designed for a remote database: one short transaction that locks the
 * station's row, reads existing IDs and cooldown state, and makes a single
 * multi-row insert. Every non-duplicate tap is stored, including cooldown
 * ones, so organizers can see repeat taps in the log. The games running at
 * the station judge each tap, and it's stored with their combined status:
 * `no_game` when none runs there, or none counts it. Each stored tap gets a
 * `tap_stored` log line once the transaction commits, so taps lost to a
 * restore can be rebuilt from the logs.
 *
 * It sees only users, never a token.
 */
export class TapPipeline {
  #db: Db;
  #cooldownMs: number;
  #games: readonly GameOnStations[];
  #now: () => Date;

  constructor(db: Db, options: TapPipelineOptions) {
    this.#db = db;
    this.#cooldownMs = options.cooldownSeconds * 1000;
    this.#games = options.games;
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

    const stored: PendingTap[] = [];
    const results = await this.#db.transaction(async (tx) => {
      const station = await this.#lockStation(tx, stationId);
      if (!station) throw new UnknownStation();
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
        const tappedAt = trustedTappedAt(tap.tappedAt, now);
        pending.push({
          index,
          clientTapId: tap.clientTapId,
          tappedAt,
          effectiveAt: tappedAt ?? receivedAt,
          userId: tap.userId,
          status: "no_game",
        });
      });
      if (pending.length === 0) return results;

      // 2. The games at this station judge the rest, one after another on the one connection.
      const context: GameContext = {
        stationId,
        tx,
        cooldown: (toJudge) => this.#cooldown(tx, stationId, toJudge),
      };
      const gameTaps: GameTap[] = pending.map(({ clientTapId, userId, tappedAt, effectiveAt }) => ({
        clientTapId,
        userId,
        tappedAt,
        effectiveAt,
      }));
      const byGame: GameStatus[][] = [];
      for (const onStations of this.#games) {
        if (!runsAt(onStations, station.game)) continue;
        const { game } = onStations;
        const statuses = await game.judge(gameTaps, context);
        if (statuses.length !== gameTaps.length) {
          throw new Error(`${game.id} judged ${statuses.length} of ${gameTaps.length} taps`);
        }
        byGame.push(statuses);
      }
      pending.forEach((p, i) => {
        p.status = combinedStatus(byGame.map((statuses) => statuses[i]!));
      });

      // 3. One write round trip. With the lock held, no row here can already exist; the no-op
      //    update is only so that one never fails the batch. Never INSERT IGNORE, which would
      //    also store bad values without a word.
      const rows: NewTap[] = pending.map((p) => ({
        stationId,
        clientTapId: p.clientTapId,
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
      stored.push(...pending);
      return results;
    });

    for (const p of stored) {
      log("tap_stored", {
        station_id: stationId,
        client_tap_id: p.clientTapId,
        user_id: p.userId,
        tapped_at: p.tappedAt,
        status: p.status,
        source,
      });
    }
    return results;
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
   *
   * The lock also keeps the station's game from changing mid-ingest, since
   * changing it takes the same lock (admin-routes.ts).
   *
   * Gives the station's game, or null when there is no such station.
   */
  async #lockStation(tx: Tx, stationId: string): Promise<{ game: string | null } | null> {
    const [station] = await tx
      .select({ game: stations.game })
      .from(stations)
      .where(eq(stations.id, stationId))
      .limit(1)
      .for("update");
    return station ?? null;
  }

  /**
   * The cooldown, which GameContext.cooldown hands the games: a tap is held
   * back when one of the same user's accepted taps at this station, stored or
   * earlier in `toJudge`, is inside the window on either side of it. Walking
   * `toJudge` in time order means an offline flush is judged by when taps
   * happened.
   */
  async #cooldown(tx: Tx, stationId: string, toJudge: readonly GameTap[]): Promise<boolean[]> {
    const heldBack = toJudge.map(() => false);
    if (toJudge.length === 0) return heldBack;
    const accepted = await this.#acceptedTimes(tx, stationId, toJudge);
    const inTimeOrder = toJudge
      .map((tap, index) => ({ tap, index }))
      .sort((a, b) => a.tap.effectiveAt.localeCompare(b.tap.effectiveAt));
    for (const { tap, index } of inTimeOrder) {
      const times = accepted.get(tap.userId) ?? [];
      if (times.some((at) => this.#withinCooldown(at, tap.effectiveAt))) {
        heldBack[index] = true;
        continue;
      }
      times.push(tap.effectiveAt);
      accepted.set(tap.userId, times);
    }
    return heldBack;
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
   * close enough to some tap in `toJudge` to put it in cooldown. Fetching
   * every nearby tap, not just the latest, matters for a late offline flush:
   * its taps sit between ones already stored.
   */
  async #acceptedTimes(
    tx: Tx,
    stationId: string,
    toJudge: readonly GameTap[],
  ): Promise<Map<string, string[]>> {
    const known = toJudge.map((p) => ({ userId: p.userId, at: Date.parse(p.effectiveAt) }));
    if (this.#cooldownMs <= 0) return new Map();

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
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.at]);
    }
    return byUser;
  }
}
