import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { GameContext, GameDeps, GameStatus, StationText, Tx } from "../../event/games.ts";
import type { Db } from "../../db/pool.ts";
import type { HintHuntGame } from "../../event/hint-hunt.ts";
import { log } from "../../lib/log.ts";
import { groupMembers, stations } from "../../event/schema.ts";
import {
  type EndedHow,
  hintHuntPlayers as players,
  hintHuntRounds as rounds,
  type StoredHint,
} from "./schema.ts";
import { HINT_HUNT_LINES, hintScreen, joiningScreen, plain } from "./screens.ts";

/** BAC-203, the API agreement's section 4, next version after 0.14. */
export const HINT_HUNT_RULES = {
  joinMs: 30_000,
  hintEveryMs: 10_000,
  maxHints: 4,
  afterLastHintMs: 10_000,
  tries: 3,
  minPlayers: 3,
  minGroups: 2,
};

/** How long after a step its station's alarm wakes this service (11.13, BAC-206). */
export const WAKE_MARGIN_MS = 250;

type Round = typeof rounds.$inferSelect;
type AfterCommit = GameContext["afterCommit"];
export type Schedule = (work: () => Promise<void>, delayMs: number) => void;

function scheduleTimeout(work: () => Promise<void>, delayMs: number) {
  setTimeout(() => {
    void work().catch(() => log("after_commit_failed"));
  }, delayMs).unref();
}

function configuredStations(db: Db | Tx) {
  return db
    .select()
    .from(stations)
    .where(and(eq(stations.game, "hint_hunt"), isNull(stations.disabledAt)))
    .orderBy(asc(stations.createdAt), asc(stations.id));
}

async function latestRound(tx: Tx, stationId: string) {
  const [round] = await tx
    .select()
    .from(rounds)
    .where(eq(rounds.stationId, stationId))
    .orderBy(desc(rounds.openedAt), desc(rounds.id))
    .limit(1)
    .for("update");
  return round;
}

/** The player's row in the round, locked until the ingest ends, or undefined for someone not in it. */
async function lockedPlayer(tx: Tx, roundId: string, userId: string) {
  const [player] = await tx
    .select()
    .from(players)
    .where(and(eq(players.roundId, roundId), eq(players.userId, userId)))
    .for("update");
  return player;
}

/**
 * The hint hunt, which a player opts into by tapping in. Its hints carry answers, never who the
 * target is (the API agreement's section 4 and 9.22, next version after 0.14, BAC-203).
 */
export function hintHuntGame({
  db,
  now: clock,
  stationMessages,
  answers,
  pickTarget = (ids) => ids[randomInt(ids.length)]!,
  schedule = scheduleTimeout,
  rules: overrides,
}: Pick<GameDeps, "db" | "now" | "stationMessages" | "answers"> & {
  pickTarget?: (ids: readonly string[]) => string;
  schedule?: Schedule;
  rules?: Partial<typeof HINT_HUNT_RULES>;
}): HintHuntGame {
  const rules = { ...HINT_HUNT_RULES, ...overrides };
  const questions = answers?.questions ?? [];
  function fullHint(hint: StoredHint) {
    const index = questions.findIndex((q) => q.id === hint.questionId);
    const question = questions[index];
    const choiceIndex = question?.choices.findIndex((c) => c.id === hint.choiceId) ?? -1;
    if (!question || choiceIndex < 0) return null;
    return {
      question: question.text,
      choice: question.choices[choiceIndex]!.text,
      short: `Q${index + 1}${String.fromCharCode(65 + choiceIndex)}`,
    };
  }
  function hintAt(round: Round, index: number) {
    return new Date(Date.parse(round.startedAt!) + index * rules.hintEveryMs).toISOString();
  }
  function endsAt(round: Round) {
    return new Date(
      Date.parse(hintAt(round, round.hints.length - 1)) + rules.afterLastHintMs,
    ).toISOString();
  }
  // Shown hints depend only on persisted start time and now, never message delivery (6.1, BAC-203).
  function shownCount(round: Round, now: Date) {
    return round.startedAt === null
      ? 0
      : Math.min(
          round.hints.length,
          Math.max(
            0,
            Math.floor(
              (Math.min(now.getTime(), Date.parse(round.endedAt ?? now.toISOString())) -
                Date.parse(round.startedAt)) /
                rules.hintEveryMs,
            ) + 1,
          ),
        );
  }
  function shownHints(round: Round, now: Date) {
    return round.hints.slice(0, shownCount(round, now)).flatMap((hint) => {
      const full = fullHint(hint);
      return full ? [full] : [];
    });
  }
  function screen(round: Round, now: Date, triesLeft?: number) {
    const count = shownCount(round, now);
    const last = count === round.hints.length;
    return hintScreen(
      shownHints(round, now).map((hint) => hint.short),
      last ? endsAt(round) : hintAt(round, count),
      last,
      now,
      triesLeft,
    );
  }
  async function chooseHints(tx: Tx, joined: { userId: string }[]) {
    const all = await Promise.all(
      joined.map(async (player) => ({
        id: player.userId,
        fixed: (await answers?.fixedAnswersOf(tx, player.userId)) ?? null,
        choices: (await answers?.answersOf(tx, player.userId)) ?? {},
      })),
    );
    const eligible = all.filter(
      (player) => player.fixed !== null && Object.keys(player.fixed).length > 0,
    );
    if (!eligible.length) return [];
    const targetId = pickTarget(eligible.map((player) => player.id));
    const target = eligible.find((player) => player.id === targetId);
    if (!target) throw new Error("Invalid hint hunt picker");
    let matching = all.filter((player) => player.id !== target.id);
    const remaining = questions.flatMap((question) => {
      const choiceId = target.fixed![question.id];
      return choiceId ? [{ questionId: question.id, choiceId }] : [];
    });
    const hints: StoredHint[] = [];
    while (remaining.length && hints.length < rules.maxHints) {
      const shared = (hint: StoredHint) =>
        matching.filter((player) => player.choices[hint.questionId] === hint.choiceId).length;
      let best = 0;
      for (let i = 1; i < remaining.length; i++)
        if (shared(remaining[i]!) > shared(remaining[best]!)) best = i;
      const [hint] = remaining.splice(best, 1);
      hints.push(hint!);
      matching = matching.filter((player) => player.choices[hint!.questionId] === hint!.choiceId);
    }
    return hints;
  }
  function scheduleAt(stationId: string, at: string, afterCommit: AfterCommit) {
    afterCommit(
      async () => {
        const delay = Date.parse(at) - clock().getTime();
        if (delay > 0) schedule(() => advance(db, clock()), delay);
        // Even a step already due gets its wake, since this request may end before anything
        // else advances the round. The margin keeps an alarm from arriving just before the step
        // by this service's clock, when it would do nothing.
        await stationMessages.wake(stationId, new Date(Date.parse(at) + WAKE_MARGIN_MS));
      },
      { beforeReply: true },
    );
  }
  async function advanceRound(
    tx: Tx,
    round: Round,
    now: Date,
    afterCommit: AfterCommit,
    // A tap's own answer replaces a round that ended, so it sends no ending: one would show over
    // the next round's countdown once the tap's 2 seconds were up (the API agreement's 6.3).
    byTap = false,
  ): Promise<Round> {
    if (round.endedAt !== null || now.toISOString() < round.joiningUntil) return round;
    const { id } = round;
    async function endRound(endedAt: string, endedHow: EndedHow, lines: string[]) {
      const [changed] = await tx
        .update(rounds)
        .set({ endedAt, endedHow })
        .where(and(eq(rounds.id, id), isNull(rounds.endedAt)));
      if (changed.affectedRows && !byTap)
        afterCommit(() => stationMessages.send(round.stationId, { lines }));
      return { ...round, endedAt, endedHow };
    }
    if (round.startedAt === null) {
      const joined = await tx
        .select()
        .from(players)
        .where(eq(players.roundId, round.id))
        .for("update");
      const members = await tx.select().from(groupMembers);
      const groups = new Set(
        joined
          .map((p) => members.find((m) => m.userId === p.userId)?.groupId)
          .filter((id) => id != null),
      );
      if (joined.length < rules.minPlayers || groups.size < rules.minGroups)
        return endRound(round.joiningUntil, "too_few", HINT_HUNT_LINES.tooFew);
      const hints = await chooseHints(tx, joined);
      if (!hints.length) return endRound(round.joiningUntil, "no_target", HINT_HUNT_LINES.noTarget);
      const startedAt = round.joiningUntil;
      await tx
        .update(rounds)
        .set({ startedAt, hints })
        .where(and(eq(rounds.id, round.id), isNull(rounds.startedAt), isNull(rounds.endedAt)));
      round = { ...round, startedAt, hints };
      for (let i = 1; i < hints.length; i++)
        scheduleAt(round.stationId, hintAt(round, i), afterCommit);
      scheduleAt(round.stationId, endsAt(round), afterCommit);
    }
    const expiry = endsAt(round);
    if (now.toISOString() >= expiry) return endRound(expiry, "lost_time", HINT_HUNT_LINES.lostTime);
    const count = shownCount(round, now);
    // A tap leaves each new hint's message to a poll or the timer, so the hint still gets its beep,
    // and a message sent later never shows over the tap's answer once the round has ended.
    if (count > round.hintsAnnounced && !byTap) {
      const [changed] = await tx
        .update(rounds)
        .set({ hintsAnnounced: count })
        .where(
          and(
            eq(rounds.id, round.id),
            eq(rounds.hintsAnnounced, round.hintsAnnounced),
            isNull(rounds.endedAt),
          ),
        );
      // A delayed caller coalesces missed hints into today's screen. Never replay stale countdowns.
      if (changed.affectedRows) {
        const { lines, countdown } = screen(round, now);
        afterCommit(() => stationMessages.send(round.stationId, { lines, countdown, beep: true }));
      }
      round = { ...round, hintsAnnounced: count };
    }
    return round;
  }
  /** Takes every station's due step: a start, an ending or a hint's message (6.1 and 9.22). */
  async function advance(db: Db, now: Date) {
    for (const station of await configuredStations(db)) {
      const work: (() => Promise<unknown>)[] = [];
      await db.transaction(async (tx) => {
        // Same lock order as ingest: station, then round (the API agreement's 9.11).
        const [current] = await tx
          .select()
          .from(stations)
          .where(eq(stations.id, station.id))
          .for("update");
        if (current?.game !== "hint_hunt" || current.disabledAt !== null) return;
        const round = await latestRound(tx, station.id);
        if (round) await advanceRound(tx, round, now, (callback) => work.push(callback));
      });
      await Promise.all(work.map((callback) => callback()));
    }
  }

  const textByTransaction = new WeakMap<Tx, Map<string, StationText>>();
  return {
    id: "hint_hunt",
    idleLines: HINT_HUNT_LINES.idle,
    async judge(taps, { tx, now: received, stationId, afterCommit }) {
      const texts = new Map<string, StationText>();
      textByTransaction.set(tx, texts);
      const statuses: GameStatus[] = [];
      for (const tap of taps) {
        let round = await latestRound(tx, stationId);
        // `received` was taken before the ingest waited for the station's lock. A map poll or
        // the timer may have started or ended the round since, so the tap is judged no earlier
        // than that. One received before the round started costs no try, since its player saw no
        // hint, and one received before the round ended opens the next (6.1).
        const now = new Date(
          Math.max(
            received.getTime(),
            ...[round?.startedAt, round?.endedAt].flatMap((at) => (at ? [Date.parse(at)] : [])),
          ),
        );
        if (round) round = await advanceRound(tx, round, now, afterCommit, true);
        if (round && round.startedAt !== null && round.endedAt === null) {
          const mine = await lockedPlayer(tx, round.id, tap.userId);
          if (!mine) {
            statuses.push("cooldown");
            texts.set(tap.clientTapId, { ...screen(round, now), lines: HINT_HUNT_LINES.running });
            continue;
          }
          if (received.toISOString() < round.startedAt) {
            statuses.push("cooldown");
            texts.set(tap.clientTapId, screen(round, now));
            continue;
          }
          const fixed = await answers?.fixedAnswersOf(tx, tap.userId);
          const hints = round.hints.slice(0, shownCount(round, now));
          if (fixed && hints.every((hint) => fixed[hint.questionId] === hint.choiceId)) {
            await tx
              .update(rounds)
              .set({ endedAt: now.toISOString(), endedHow: "won" })
              .where(eq(rounds.id, round.id));
            statuses.push("accepted");
            texts.set(tap.clientTapId, plain(HINT_HUNT_LINES.won, true));
          } else {
            const triesLeft = Math.max(0, round.triesLeft - 1);
            await tx
              .update(rounds)
              .set({
                triesLeft,
                ...(triesLeft === 0 && {
                  endedAt: now.toISOString(),
                  endedHow: "lost_tries" as const,
                }),
              })
              .where(eq(rounds.id, round.id));
            statuses.push("cooldown");
            texts.set(
              tap.clientTapId,
              triesLeft === 0 ? plain(HINT_HUNT_LINES.lostTries) : screen(round, now, triesLeft),
            );
          }
          continue;
        }
        const [member] = await tx
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.userId, tap.userId));
        if (!member?.groupId) {
          statuses.push("cooldown");
          texts.set(tap.clientTapId, plain(HINT_HUNT_LINES.noGroup));
          continue;
        }
        if (!round || round.endedAt !== null) {
          round = {
            id: crypto.randomUUID(),
            stationId,
            openedAt: now.toISOString(),
            joiningUntil: new Date(now.getTime() + rules.joinMs).toISOString(),
            startedAt: null,
            hints: [],
            hintsAnnounced: 0,
            triesLeft: rules.tries,
            endedAt: null,
            endedHow: null,
          };
          await tx.insert(rounds).values(round);
          scheduleAt(round.stationId, round.joiningUntil, afterCommit);
        }
        const mine = await lockedPlayer(tx, round.id, tap.userId);
        if (!mine) await tx.insert(players).values({ roundId: round.id, userId: tap.userId });
        const joined = await tx
          .select()
          .from(players)
          .where(eq(players.roundId, round.id))
          .for("update");
        statuses.push(mine ? "cooldown" : "accepted");
        texts.set(tap.clientTapId, joiningScreen(joined.length, round.joiningUntil, now, !!mine));
      }
      return statuses;
    },
    advance,
    async mapState(db, now) {
      await advance(db, now);
      const shown = [];
      // No entry for a station without a round. Enabled stations only, oldest first (9.22).
      for (const station of await configuredStations(db)) {
        const [round] = await db
          .select()
          .from(rounds)
          .where(eq(rounds.stationId, station.id))
          .orderBy(desc(rounds.openedAt), desc(rounds.id))
          .limit(1);
        if (!round) continue;
        const joined = await db.select().from(players).where(eq(players.roundId, round.id));
        shown.push({
          station_id: station.id,
          opened_at: round.openedAt,
          joining_until: round.joiningUntil,
          players: joined.length,
          started_at: round.startedAt,
          hints: shownHints(round, now),
          tries_left: round.triesLeft,
          next_hint_at:
            round.startedAt !== null &&
            round.endedAt === null &&
            shownCount(round, now) < round.hints.length
              ? hintAt(round, shownCount(round, now))
              : null,
          ends_at:
            round.startedAt !== null && shownCount(round, now) === round.hints.length
              ? endsAt(round)
              : null,
          ended_at: round.endedAt,
          ended_how: round.endedHow,
        });
      }
      return { rounds: shown };
    },
    async lines(taps, { tx }) {
      return taps.map((tap) => textByTransaction.get(tx)?.get(tap.clientTapId) ?? null);
    },
  };
}
