import { randomInt } from "node:crypto";
import {
  LINE_LENGTH,
  MAX_COUNTDOWN_SECONDS,
  SECONDS_LEFT,
  type Countdown,
} from "@geekykey/handoff";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/pool.ts";
import { forTheScreen } from "../../event/display-names.ts";
import type { GameStatus, StationText, Tx } from "../../event/games.ts";
import type { RelayGame } from "../../event/relay.ts";
import { groupMembers, participantGroups, stations } from "../../event/schema.ts";
import type { StationMessages } from "../../event/station-messages.ts";
import { relayGames, relayLock, relayTransfers } from "./schema.ts";

/** BAC-184's timings and targets, together for the API agreement's section 4 draft. */
export const RELAY_RULES = {
  transferMs: 20_000,
  idleMs: 120_000,
  twoGroupTransfers: 3,
  manyGroupTransfers: 4,
};

type Call = typeof relayTransfers.$inferSelect;
type Group = typeof participantGroups.$inferSelect;

/** A literal {s} in a name would read as the countdown's seconds, and never goes in `lines` (6.1). */
function withoutSeconds(text: string) {
  return text.replaceAll(SECONDS_LEFT, "(s)");
}

function groupName(groups: Group[], id: string) {
  const index = groups.findIndex((g) => g.id === id);
  if (index < 0) return "Group";
  return withoutSeconds(forTheScreen(groups[index]!.name) ?? `Group ${index + 1}`);
}

function boothName(booth: string | null) {
  return withoutSeconds((booth === null ? null : forTheScreen(booth)) ?? "other");
}

/** The enabled stations running the relay, oldest first (the API agreement's 9.13 draft). */
function configuredStations(db: Db | Tx) {
  return db
    .select()
    .from(stations)
    .where(and(eq(stations.game, "relay"), isNull(stations.disabledAt)))
    .orderBy(asc(stations.createdAt), asc(stations.id));
}

/**
 * Cut the group first (agreement 6.1). A booth longer than eleven characters must also
 * be cut, leaving at least one character of the group and the whole " to ".
 */
function destination(group: string, booth: string) {
  const place = booth.slice(0, LINE_LENGTH - 5);
  return `${group.slice(0, LINE_LENGTH - place.length - 4)} to ${place}`;
}

function countdown(call: Call, line: string, now: Date): Countdown {
  return {
    seconds: Math.min(
      MAX_COUNTDOWN_SECONDS,
      Math.ceil((Date.parse(call.closesAt) - now.getTime()) / 1000),
    ),
    lines: [line, `${SECONDS_LEFT}s left`],
    ending: ["Missed it", "Tap again"],
  };
}

/** One relay per event, after the pipeline's station lock. See tap-pipeline.ts at #lockStation for TiDB reads. */
async function lockRelay(tx: Tx) {
  await tx
    .insert(relayLock)
    .values({ id: 1 })
    .onDuplicateKeyUpdate({ set: { id: sql`${relayLock.id}` } });
  await tx.select().from(relayLock).where(eq(relayLock.id, 1)).for("update");
}

/** A two-station game with no rewards or connections (BAC-184, agreement section 4 draft). */
export function relayGame({
  stationMessages,
  pickGroup = (ids) => ids[randomInt(ids.length)]!,
  rules: overrides,
}: {
  stationMessages: StationMessages;
  pickGroup?: (groupIds: readonly string[]) => string;
  rules?: Partial<typeof RELAY_RULES>;
}): RelayGame {
  const rules = { ...RELAY_RULES, ...overrides };
  // judge and lines get different context objects, but share the ingest's transaction.
  const textByTransaction = new WeakMap<Tx, Map<string, StationText>>();
  return {
    id: "relay",
    idleLines: ["Relay", "Tap to start"],
    async judge(taps, context) {
      const { tx, now, stationId } = context;
      // Reading configuration before the relay lock avoids locking the other station, whose
      // ingest may already hold its row while it waits for us. Relay records below use current reads.
      const relayStations = await configuredStations(tx);
      await lockRelay(tx);
      // Groups aren't the relay's records, so plain reads: locking every member would make each
      // relay tap wait on, and could deadlock with, the Groups screen's writes (groups.ts).
      const groups = await tx
        .select()
        .from(participantGroups)
        .orderBy(asc(participantGroups.createdAt), asc(participantGroups.id));
      const members = await tx.select().from(groupMembers);
      const playing = groups
        .filter((g) => members.some((m) => m.groupId === g.id))
        .map((g) => g.id);
      const texts = new Map<string, StationText>();
      textByTransaction.set(tx, texts);
      const statuses: GameStatus[] = taps.map(() => "no_game");
      for (const { tap, index } of taps
        .map((tap, index) => ({ tap, index }))
        .sort((a, b) => a.tap.effectiveAt.localeCompare(b.tap.effectiveAt))) {
        if (now.getTime() - Date.parse(tap.effectiveAt) > rules.transferMs) continue;
        let [game] = await tx
          .select()
          .from(relayGames)
          .orderBy(
            desc(sql`${relayGames.endedAt} is null`),
            desc(relayGames.startedAt),
            desc(relayGames.id),
          )
          .limit(1)
          .for("update");
        // `now` was taken before this ingest waited for the relay lock. A tap that waited behind
        // the other station's is judged no earlier than that one, so it can't answer a call made
        // after it, or move the game's times back.
        const at =
          game && game.endedAt === null
            ? new Date(Math.max(now.getTime(), Date.parse(game.lastTapAt)))
            : now;
        const atIso = at.toISOString();
        if (
          game &&
          game.endedAt === null &&
          Date.parse(game.lastTapAt) + rules.idleMs <= at.getTime()
        ) {
          const endedAt = new Date(Date.parse(game.lastTapAt) + rules.idleMs).toISOString();
          await tx
            .update(relayGames)
            .set({ endedAt, endedHow: "idle" })
            .where(eq(relayGames.id, game.id));
          game = { ...game, endedAt, endedHow: "idle" };
        }
        if (game && game.endedAt === null) {
          // Any tap the relay judges keeps its game going: it ends when nobody has tapped for
          // 2 minutes (BAC-184), even a tap that changes nothing else.
          await tx.update(relayGames).set({ lastTapAt: atIso }).where(eq(relayGames.id, game.id));
          game = { ...game, lastTapAt: atIso };
        }
        const groupId = members.find((m) => m.userId === tap.userId)?.groupId;
        const hold = (lines: string[], waiting?: Countdown) => {
          statuses[index] = "cooldown";
          texts.set(tap.clientTapId, {
            lines,
            complete: false,
            ...(waiting && { countdown: waiting }),
          });
        };
        if (!groupId) {
          hold(["Join a group", "on your phone"]);
          continue;
        }
        if (relayStations.length !== 2) {
          hold(["Relay needs", "2 stations"]);
          continue;
        }
        if (playing.length < 2) {
          hold(["Need 2 groups", "Tell organizer"]);
          continue;
        }
        const other = relayStations.find((s) => s.id !== stationId)!;
        let firstLine = "Sent!";
        if (!game || game.endedAt !== null) {
          game = {
            id: crypto.randomUUID(),
            startedAt: atIso,
            stationA: stationId,
            stationB: other.id,
            groupsPlaying: playing.length,
            transfersNeeded:
              playing.length === 2 ? rules.twoGroupTransfers : rules.manyGroupTransfers,
            lastMovedAt: atIso,
            lastTapAt: atIso,
            endedAt: null,
            endedHow: null,
          };
          await tx.insert(relayGames).values(game);
        } else {
          const [open] = await tx
            .select()
            .from(relayTransfers)
            .where(and(eq(relayTransfers.gameId, game.id), isNull(relayTransfers.completedAt)))
            .orderBy(desc(relayTransfers.calledAt), desc(relayTransfers.id))
            .limit(1)
            .for("update");
          if (open && atIso >= open.closesAt && open.toStationId === stationId) {
            const booth = boothName(other.booth);
            hold(["Too late", `Ask at ${booth.slice(0, LINE_LENGTH - 7)}`]);
            continue;
          }
          if (open && atIso < open.closesAt && open.fromStationId === stationId) {
            const name = groupName(groups, open.toGroupId);
            const line = destination(name, boothName(other.booth));
            hold(["Still waiting", line], countdown(open, line, at));
            continue;
          }
          if (open && atIso < open.closesAt && open.toGroupId !== groupId) {
            const booth = boothName(other.booth);
            hold(["Not you", `Ask at ${booth.slice(0, LINE_LENGTH - 7)}`]);
            continue;
          }
          if (
            open &&
            atIso < open.closesAt &&
            open.toStationId === stationId &&
            open.toGroupId === groupId
          ) {
            await tx
              .update(relayTransfers)
              .set({ completedAt: atIso })
              .where(eq(relayTransfers.id, open.id));
            firstLine = "Got it!";
            const completed = await tx
              .select()
              .from(relayTransfers)
              .where(eq(relayTransfers.gameId, game.id))
              .for("update");
            if (completed.filter((c) => c.completedAt !== null).length >= game.transfersNeeded) {
              await tx
                .update(relayGames)
                .set({
                  endedAt: atIso,
                  endedHow: "complete",
                  lastMovedAt: atIso,
                })
                .where(eq(relayGames.id, game.id));
              statuses[index] = "accepted";
              const lines = ["Relay done!", `${game.transfersNeeded} of ${game.transfersNeeded}`];
              texts.set(tap.clientTapId, { lines, complete: true });
              context.afterCommit(() => stationMessages.send(other.id, { lines, beep: true }));
              continue;
            }
          }
          await tx.update(relayGames).set({ lastMovedAt: atIso }).where(eq(relayGames.id, game.id));
        }
        const gameId = game.id;
        const candidates = playing.filter((id) => id !== groupId);
        const toGroupId = candidates.length === 1 ? candidates[0]! : pickGroup(candidates);
        const call: Call = {
          id: crypto.randomUUID(),
          gameId,
          fromStationId: stationId,
          toStationId: other.id,
          fromGroupId: groupId,
          toGroupId,
          calledAt: atIso,
          closesAt: new Date(at.getTime() + rules.transferMs).toISOString(),
          completedAt: null,
        };
        await tx.insert(relayTransfers).values(call);
        const name = groupName(groups, toGroupId);
        const need = `Need ${name.slice(0, LINE_LENGTH - 5)}`;
        context.afterCommit(() =>
          stationMessages.send(other.id, {
            lines: [need, "Tap here"],
            countdown: { ...countdown(call, need, at), ending: ["Missed it", ""] },
            beep: true,
          }),
        );
        const line = destination(name, boothName(other.booth));
        statuses[index] = "accepted";
        texts.set(tap.clientTapId, {
          lines: [firstLine, line],
          complete: false,
          countdown: countdown(call, line, at),
        });
      }
      return statuses;
    },
    async mapState(db, now) {
      return db.transaction(async (tx) => {
        const configured = await configuredStations(tx);
        const [game] = await tx
          .select()
          .from(relayGames)
          .orderBy(
            desc(sql`${relayGames.endedAt} is null`),
            desc(relayGames.startedAt),
            desc(relayGames.lastMovedAt),
            desc(relayGames.id),
          )
          .limit(1);
        if (!game) return { stations: configured.map((s) => s.id), game: null };
        const calls = await tx
          .select()
          .from(relayTransfers)
          .where(eq(relayTransfers.gameId, game.id))
          .orderBy(desc(relayTransfers.calledAt), desc(relayTransfers.id));
        const idleAt = new Date(Date.parse(game.lastTapAt) + rules.idleMs).toISOString();
        const endedAt = game.endedAt ?? (now.toISOString() >= idleAt ? idleAt : null);
        const open =
          endedAt === null
            ? calls.find((c) => c.completedAt === null && now.toISOString() < c.closesAt)
            : undefined;
        return {
          stations: configured.map((s) => s.id),
          game: {
            started_at: game.startedAt,
            transfers: calls.filter((c) => c.completedAt !== null).length,
            transfers_needed: game.transfersNeeded,
            calling_station_id: open?.fromStationId ?? null,
            waiting_station_id: open?.toStationId ?? null,
            waiting_until: open?.closesAt ?? null,
            ended_at: endedAt,
            complete: game.endedHow === "complete",
          },
        };
      });
    },
    async lines(taps, { tx }) {
      return taps.map((tap) => textByTransaction.get(tx)?.get(tap.clientTapId) ?? null);
    },
  };
}
