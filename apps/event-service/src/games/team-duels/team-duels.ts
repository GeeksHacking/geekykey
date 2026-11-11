import { randomInt } from "node:crypto";
import { LINE_LENGTH } from "@geekykey/handoff";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../../db/pool.ts";
import { DEFAULT_DISPLAY_NAME, greetingNames } from "../../event/display-names.ts";
import { loadChallenge } from "../../event/event-settings.ts";
import type { GameStatus, Tx } from "../../event/games.ts";
import { groupsOf, shuffleAtRandom, type Shuffle } from "../../event/groups.ts";
import { reactionFrom } from "../../event/reaction.ts";
import { users } from "../../event/schema.ts";
import type { Round, TeamDuelsGame } from "../../event/team-duels.ts";
import { duelRoundPlayers as players, duelRounds as rounds, duels } from "./schema.ts";

type StoredRound = typeof rounds.$inferSelect;
type Duel = typeof duels.$inferSelect;
const OPEN_MS = 30_000;
type Player = typeof players.$inferSelect;

function reaction(row: Duel, round: StoredRound, isA: boolean, now: Date) {
  const a = { ms: row.reactionAMs, at: row.reactionAAt };
  const b = { ms: row.reactionBMs, at: row.reactionBAt };
  return reactionFrom(round.closesAt, isA ? a : b, isA ? b : a, now);
}

/** Count duel wins; a reaction round waits for every duel or its play deadline. */
function scores(round: StoredRound, rows: Duel[], now: Date) {
  let a = 0;
  let b = 0;
  let ended = round.formedAt !== null;
  for (const row of rows) {
    if (round.challenge === "dice") {
      if (row.rollA! >= row.rollB!) a++;
      if (row.rollB! >= row.rollA!) b++;
    } else {
      const resultA = reaction(row, round, true, now).result;
      const resultB = reaction(row, round, false, now).result;
      if (resultA === null || resultB === null) ended = false;
      if (resultA === "win") a++;
      if (resultB === "win") b++;
    }
  }
  return { a, b, ended };
}

/**
 * Maximum matching to slots on the smaller team. Duplicating one slot for an odd round
 * gives that player two duels. Try each possible duplicated player, keeping the pairing
 * with most opponents from different groups. Same-group edges fill the unmatched slots.
 */
function pairTeams(a: string[], b: string[], group: (id: string) => string) {
  let best: [string, string][] = [];
  let bestScore = -1;
  const large = a.length >= b.length ? a : b;
  const small = a.length >= b.length ? b : a;
  for (const extra of large.length === small.length ? [null] : small) {
    const slots = extra === null ? [...small] : [...small, extra];
    const assigned = new Map<number, string>();
    function match(user: string, seen: Set<number>): boolean {
      for (let i = 0; i < slots.length; i++) {
        if (seen.has(i) || group(user) === group(slots[i]!)) continue;
        seen.add(i);
        const previous = assigned.get(i);
        if (!previous || match(previous, seen)) {
          assigned.set(i, user);
          return true;
        }
      }
      return false;
    }
    for (const user of large) match(user, new Set());
    const count = assigned.size;
    const unmatched = large.filter((id) => ![...assigned.values()].includes(id));
    for (let i = 0; i < slots.length; i++)
      if (!assigned.has(i)) assigned.set(i, unmatched.shift()!);
    if (count > bestScore) {
      bestScore = count;
      best = [...assigned].map(([i, user]) =>
        a === large ? [user, slots[i]!] : [slots[i]!, user],
      );
    }
  }
  return best;
}

/** Screen wording follows the BAC-155 draft for the API agreement's section 13. */
function joinedLine(status: GameStatus, name: string | undefined) {
  if (status === "cooldown") return "Already in";
  if (name) return `${name.slice(0, LINE_LENGTH - 7)} joined`;
  return "Player joined";
}

/** Spread each group evenly before pairing, keeping the two teams within one player. */
function allocateTeams(joined: Player[], group: (id: string) => string, shuffle: Shuffle) {
  const buckets = new Map<string, string[]>();
  for (const p of shuffle([...joined])) {
    const key = group(p.userId);
    buckets.set(key, [...(buckets.get(key) ?? []), p.userId]);
  }
  const a: string[] = [];
  const b: string[] = [];
  for (const bucket of buckets.values()) {
    let nextA = a.length <= b.length;
    for (const user of bucket) {
      (nextA ? a : b).push(user);
      nextA = !nextA;
    }
  }
  return { a, b };
}

/** Equal scores win for both only when a duel was won (BAC-155 draft, agreement 8.1). */
function wonRound(team: Player["team"], score: ReturnType<typeof scores>) {
  if (team === null) return false;
  const your = team === "a" ? score.a : score.b;
  const their = team === "a" ? score.b : score.a;
  return your > 0 && your >= their;
}

/**
 * The round lock guards forming, membership changes and the final score. Callers lock
 * round rows in ID order before any memberships or duels. No user row is locked.
 * Ingest already holds the station row (tap-pipeline.ts's #lockStation).
 */
async function lockRound(tx: Tx, id: string) {
  const [round] = await tx.select().from(rounds).where(eq(rounds.id, id)).for("update");
  return round ?? null;
}

/** Persist the result once, so history needs only an aggregate over memberships. */
async function settle(tx: Tx, round: StoredRound, now: Date) {
  if (round.endedAt !== null || round.formedAt === null) return round;
  const rows = await tx.select().from(duels).where(eq(duels.roundId, round.id)).for("update");
  const score = scores(round, rows, now);
  if (!score.ended) return round;
  const joined = await tx.select().from(players).where(eq(players.roundId, round.id)).for("update");
  for (const member of joined) {
    await tx
      .update(players)
      .set({ won: wonRound(member.team, score) })
      .where(and(eq(players.roundId, round.id), eq(players.userId, member.userId)));
  }
  const endedAt = now.toISOString();
  await tx.update(rounds).set({ endedAt }).where(eq(rounds.id, round.id));
  return { ...round, endedAt };
}

/** A station game with independent duels, never connections (BAC-155 draft, sections 4 and 8.1). */
export function teamDuelsGame({
  shuffle = shuffleAtRandom,
  rollDie = () => randomInt(1, 7),
  pickGame = () => (randomInt(2) === 0 ? "dice" : "reaction"),
}: {
  shuffle?: Shuffle;
  rollDie?: () => number;
  pickGame?: () => "dice" | "reaction";
} = {}): TeamDuelsGame {
  /** Form lazily on ingest or /me, since no worker runs at closes_at (BAC-155, agreement 8.1 draft).
   * The round lock makes concurrent phones roll each die only once.
   */
  async function form(tx: Tx, id: string, now: Date) {
    const round = await lockRound(tx, id);
    if (!round) return null;
    if (round.formedAt !== null || now.toISOString() < round.closesAt) return round;
    const joined = await tx
      .select()
      .from(players)
      .where(eq(players.roundId, id))
      .orderBy(asc(players.joinedAt), asc(players.userId))
      .for("update");
    const setting = await loadChallenge(tx);
    const challenge = setting === "random" ? pickGame() : setting;
    if (joined.length >= 2) {
      const groups = await groupsOf(
        tx,
        joined.map((p) => p.userId),
      );
      const group = (user: string) =>
        groups.get(user) === undefined ? `user:${user}` : `group:${groups.get(user)}`;
      const { a, b } = allocateTeams(joined, group, shuffle);
      for (const [team, ids] of [
        ["a", a],
        ["b", b],
      ] as const) {
        await tx
          .update(players)
          .set({ team })
          .where(and(eq(players.roundId, id), inArray(players.userId, ids)));
      }
      await tx.insert(duels).values(
        pairTeams(a, b, group).map(([userA, userB]) => ({
          id: crypto.randomUUID(),
          roundId: id,
          userA,
          userB,
          rollA: challenge === "dice" ? rollDie() : null,
          rollB: challenge === "dice" ? rollDie() : null,
        })),
      );
    }
    const formed = { ...round, formedAt: now.toISOString(), challenge };
    await tx.update(rounds).set({ formedAt: formed.formedAt, challenge }).where(eq(rounds.id, id));
    return settle(tx, formed, now);
  }

  /** Present only the latest round; absent users remain Guest without creating a login. */
  async function presentRound(
    db: Db,
    round: StoredRound,
    userId: string,
    now: Date,
  ): Promise<Round> {
    const joined = await db.select().from(players).where(eq(players.roundId, round.id));
    const rows = await db
      .select()
      .from(duels)
      .where(eq(duels.roundId, round.id))
      .orderBy(asc(duels.id));
    const mine = joined.find((p) => p.userId === userId)!;
    const score = scores(round, rows, now);
    const your = mine.team === "a" ? score.a : score.b;
    const their = mine.team === "a" ? score.b : score.a;
    const won = wonRound(mine.team, score);
    const people = await db
      .select()
      .from(users)
      .where(
        inArray(
          users.id,
          joined.map((p) => p.userId),
        ),
      );
    const name = (id: string) =>
      people.find((p) => p.id === id)?.displayName ?? DEFAULT_DISPLAY_NAME;
    let state: Round["state"] = "opening";
    if (score.ended) state = "ended";
    else if (round.formedAt !== null) state = "playing";
    let outcome: "win" | "loss" | "nobody_joined" = won ? "win" : "loss";
    if (mine.team === null) outcome = "nobody_joined";
    return {
      id: round.id,
      state,
      closes_at: round.closesAt,
      players: joined.length,
      challenge: round.challenge,
      team: mine.team,
      teammates:
        mine.team === null
          ? []
          : joined
              .filter((p) => p.userId !== userId && p.team === mine.team)
              .map((p) => name(p.userId)),
      duels: rows
        .filter((r) => r.userA === userId || r.userB === userId)
        .map((r) => {
          const isA = r.userA === userId;
          const yourRoll = isA ? r.rollA : r.rollB;
          const theirRoll = isA ? r.rollB : r.rollA;
          return {
            id: r.id,
            opponent: name(isA ? r.userB : r.userA),
            dice:
              yourRoll === null || theirRoll === null
                ? null
                : {
                    your_roll: yourRoll,
                    their_roll: theirRoll,
                    result: yourRoll >= theirRoll ? "win" : "loss",
                  },
            reaction: round.challenge === "reaction" ? reaction(r, round, isA, now) : null,
          };
        }),
      result: score.ended
        ? {
            outcome,
            your_team_wins: your,
            their_team_wins: their,
          }
        : null,
    };
  }

  return {
    id: "team_duels",
    async judge(taps, { stationId, tx, now }) {
      const statuses: GameStatus[] = taps.map(() => "no_game");
      if (!taps.length) return statuses;
      // Discovery at other stations is best effort: a concurrent ingest's new round
      // may be absent from TiDB's snapshot. Never create or lock a user for this check.
      const known = await tx
        .select({ roundId: players.roundId })
        .from(players)
        .innerJoin(rounds, eq(rounds.id, players.roundId))
        .where(
          and(
            inArray(
              players.userId,
              taps.map((tap) => tap.userId),
            ),
            isNull(rounds.endedAt),
          ),
        );
      // One order for ALL discovered rounds, before locking any membership. The
      // station clause also sees rows committed while its station lock was awaited.
      const locked = await tx
        .select()
        .from(rounds)
        .where(
          or(
            eq(rounds.stationId, stationId),
            inArray(
              rounds.id,
              known.map((p) => p.roundId),
            ),
          ),
        )
        .orderBy(asc(rounds.id))
        .for("update");
      const atStation = locked.filter((round) => round.stationId === stationId);
      for (const { tap, index } of taps
        .map((tap, index) => ({ tap, index }))
        .sort((a, b) => a.tap.effectiveAt.localeCompare(b.tap.effectiveAt))) {
        const old = atStation.find(
          (r) => r.openedAt <= tap.effectiveAt && tap.effectiveAt < r.closesAt,
        );
        // Saved taps cannot join after their opening window (BAC-155, agreement 4 draft).
        if (
          (old && now.toISOString() >= old.closesAt) ||
          (!old && now.getTime() - Date.parse(tap.effectiveAt) >= OPEN_MS)
        )
          continue;
        let held = false;
        // Form known rounds even at another station, so a finished dice round or
        // a walk-away does not hold this tap back until somebody next opens /me.
        for (const stored of locked) {
          if (stored.endedAt !== null) continue;
          const round = (await form(tx, stored.id, now))!;
          const current = await settle(tx, round, now);
          const [mine] = await tx
            .select()
            .from(players)
            .where(and(eq(players.roundId, round.id), eq(players.userId, tap.userId)))
            .for("update");
          if (mine && current.endedAt === null) held = true;
        }
        if (held) {
          statuses[index] = "cooldown";
          continue;
        }
        let opening = atStation.find((r) => now.toISOString() < r.closesAt);
        if (!opening) {
          opening = {
            id: crypto.randomUUID(),
            stationId,
            openedAt: tap.effectiveAt,
            closesAt: new Date(Date.parse(tap.effectiveAt) + OPEN_MS).toISOString(),
            formedAt: null,
            challenge: null,
            endedAt: null,
          };
          await tx.insert(rounds).values(opening);
          atStation.push(opening);
          // A new row is private until commit; nobody else can acquire its lock.
          locked.push(opening);
        }
        await tx
          .insert(players)
          .values({ roundId: opening.id, userId: tap.userId, joinedAt: tap.effectiveAt });
        statuses[index] = "accepted";
      }
      return statuses;
    },
    async lines(taps, { tx, now }) {
      const names = await greetingNames(
        tx,
        taps.map((t) => t.userId),
      );
      return Promise.all(
        taps.map(async (tap) => {
          const [latest] = await tx
            .select({ round: rounds })
            .from(players)
            .innerJoin(rounds, eq(rounds.id, players.roundId))
            .where(eq(players.userId, tap.userId))
            .orderBy(desc(rounds.openedAt), desc(rounds.id))
            .limit(1);
          if (!latest) return null;
          const joined = await tx
            .select()
            .from(players)
            .where(eq(players.roundId, latest.round.id));
          const seconds = Math.max(
            0,
            Math.ceil((Date.parse(latest.round.closesAt) - now.getTime()) / 1000),
          );
          const name = names.get(tap.userId);
          return {
            complete: false,
            lines: [
              joinedLine(tap.status, name),
              (seconds > 0 ? `${joined.length} in, ${seconds}s left` : "Still playing").slice(
                0,
                LINE_LENGTH,
              ),
            ],
          };
        }),
      );
    },
    async roundsOf(db, userId, now) {
      // Only unfinished rounds can need work. Ordinary polls take no transaction.
      const pending = await db
        .select({ round: rounds })
        .from(players)
        .innerJoin(rounds, eq(rounds.id, players.roundId))
        .where(and(eq(players.userId, userId), isNull(rounds.endedAt)))
        .orderBy(asc(rounds.id));
      for (const { round } of pending) {
        const due =
          round.formedAt === null
            ? now.toISOString() >= round.closesAt
            : now.getTime() >= Date.parse(round.closesAt) + 120_000;
        if (!due) continue;
        await db.transaction(async (tx) => {
          const formed = await form(tx, round.id, now);
          if (formed) await settle(tx, formed, now);
        });
      }
      const [latest] = await db
        .select({ round: rounds })
        .from(players)
        .innerJoin(rounds, eq(rounds.id, players.roundId))
        .where(eq(players.userId, userId))
        .orderBy(desc(rounds.openedAt), desc(rounds.id))
        .limit(1);
      const [history] = await db
        .select({ wins: sql<number>`coalesce(sum(${players.won}), 0)` })
        .from(players)
        .where(eq(players.userId, userId));
      return {
        round: latest ? await presentRound(db, latest.round, userId, now) : null,
        round_wins: Number(history!.wins),
      };
    },
    async playReaction(db: Db, { duelId, userId, ms }, now) {
      const [found] = await db
        .select({ roundId: duels.roundId })
        .from(duels)
        .where(eq(duels.id, duelId));
      if (!found) return { status: "not_found" as const };
      return db.transaction(async (tx) => {
        const round = await lockRound(tx, found.roundId);
        const [row] = await tx.select().from(duels).where(eq(duels.id, duelId)).for("update");
        if (!row || (row.userA !== userId && row.userB !== userId))
          return { status: "not_found" as const };
        if (!round || round.challenge !== "reaction") return { status: "not_found" as const };
        const isA = row.userA === userId;
        if ((isA ? row.reactionAAt : row.reactionBAt) !== null)
          return { status: "already_played" as const };
        if (reaction(row, round, isA, now).yourPlay === "missed")
          return { status: "too_late" as const };
        const played = isA
          ? { reactionAMs: ms, reactionAAt: now.toISOString() }
          : { reactionBMs: ms, reactionBAt: now.toISOString() };
        await tx.update(duels).set(played).where(eq(duels.id, duelId));
        await settle(tx, round, now);
        return {
          status: "played" as const,
          reaction: reaction({ ...row, ...played }, round, isA, now),
        };
      });
    },
  };
}
