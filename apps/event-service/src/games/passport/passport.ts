import { LINE_LENGTH } from "@geekykey/handoff";
import { and, eq, inArray, ne } from "drizzle-orm";
import { greetingNames } from "../../event/display-names.ts";
import type { Game, JudgedTap, StationText, Tx } from "../../event/games.ts";
import { PASSPORT_GAME_ID, passportStations, stations, taps } from "../../event/schema.ts";
import { runsThePassport } from "../../event/stamp-slots.ts";

/**
 * The passport: a participant collects a stamp at each station that runs it
 * and has passport settings, worth that station's points. It counts a tap at
 * one of its stations unless the cooldown holds it back. Its record of what
 * it counted is the accepted taps at its stations, so it writes nothing of
 * its own. That holds while no other game counts taps at a passport station:
 * a tap another game counted there would be `accepted` too, and earn a stamp.
 * So a station's game is fixed once it has a tap a game counted or held back.
 *
 * Organizers choose the stations it runs on, and its settings are their data
 * too, in `passport_stations`. A station that runs it with no settings yet
 * isn't one of its stamp slots, so it checks them itself.
 *
 * After each tap it counted or held back, the station shows the participant's
 * progress, by name when they have one, and what happened, such as
 * `Alex: 3 of 6` and `Tap counted!`. The tap that earns the last stamp says
 * `All 6 done!`, and finishes the game.
 */
export const passport: Game = {
  id: PASSPORT_GAME_ID,
  async judge(taps, { stationId, tx, cooldown }) {
    const [settings] = await tx
      .select({ stationId: passportStations.stationId })
      .from(passportStations)
      .where(eq(passportStations.stationId, stationId))
      .limit(1)
      // To see the latest settings, as the pipeline's reads do.
      .for("update");
    if (settings === undefined) return taps.map(() => "no_game");
    const heldBack = await cooldown(taps);
    return heldBack.map((held) => (held ? "cooldown" : "accepted"));
  },

  async lines(judged, { stationId, tx }) {
    // A tap judged here means the station is a stamp slot, and the participant has its stamp:
    // one they had, which held the tap back or which it counted again, or one it just earned.
    const userIds = [...new Set(judged.map((tap) => tap.userId))];
    const { slots, elsewhere } = await stampsElsewhere(tx, stationId, userIds);
    const finishing = await newStamps(tx, stationId, judged);
    const names = await greetingNames(tx, userIds);

    return judged.map((tap): StationText => {
      const stamps = 1 + (elsewhere.get(tap.userId) ?? 0);
      const complete = finishing.has(tap.clientTapId) && stamps === slots;
      return {
        lines: [
          progressLine(names.get(tap.userId), stamps, slots),
          complete
            ? `All ${slots} done!`
            : tap.status === "accepted"
              ? "Tap counted!"
              : "Already counted",
        ],
        complete,
      };
    });
  },
};

/**
 * How many stamp slots there are, and each of `userIds`' stamps at the ones
 * other than `stationId`, in one read.
 *
 * Not a locking read, unlike the pipeline's: it would lock every stamp slot's
 * station row, so each passport station's taps would wait for every other's.
 * So it sees the other stations as they were when the ingest began, which
 * misses only a stamp the same participant earned at another station in that
 * moment. The pipeline's lock keeps this station's own taps up to date, and
 * they're counted apart.
 */
async function stampsElsewhere(tx: Tx, stationId: string, userIds: readonly string[]) {
  const rows = await tx
    .selectDistinct({ slot: passportStations.stationId, userId: taps.userId })
    .from(passportStations)
    .innerJoin(stations, and(eq(stations.id, passportStations.stationId), runsThePassport))
    .leftJoin(
      taps,
      and(
        eq(taps.stationId, passportStations.stationId),
        ne(taps.stationId, stationId),
        eq(taps.status, "accepted"),
        inArray(taps.userId, userIds),
      ),
    );
  const elsewhere = new Map<string, number>();
  for (const { userId } of rows) {
    if (userId !== null) elsewhere.set(userId, (elsewhere.get(userId) ?? 0) + 1);
  }
  return { slots: new Set(rows.map((row) => row.slot)).size, elsewhere };
}

/**
 * The taps among `judged` that earned the participant this station's stamp: for
 * each participant with no accepted tap here before these, their first accepted
 * one by when it happened.
 */
async function newStamps(
  tx: Tx,
  stationId: string,
  judged: readonly JudgedTap[],
): Promise<Set<string>> {
  const accepted = judged
    .filter((tap) => tap.status === "accepted")
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  if (accepted.length === 0) return new Set();

  const these = new Set(judged.map((tap) => tap.clientTapId));
  const rows = await tx
    .select({ userId: taps.userId, clientTapId: taps.clientTapId })
    .from(taps)
    .where(
      and(
        eq(taps.stationId, stationId),
        eq(taps.status, "accepted"),
        inArray(taps.userId, [...new Set(accepted.map((tap) => tap.userId))]),
      ),
    )
    // To see the latest rows, as the pipeline's reads do.
    .for("update");
  const hadOne = new Set(rows.filter((row) => !these.has(row.clientTapId)).map((r) => r.userId));

  const earned = new Set<string>();
  for (const tap of accepted) {
    if (hadOne.has(tap.userId)) continue;
    hadOne.add(tap.userId);
    earned.add(tap.clientTapId);
  }
  return earned;
}

/**
 * The participant's progress in one row of the screen: `Alex: 3 of 6`, with as
 * much of their name as fits, or `3 of 6 stamps` without one.
 */
function progressLine(name: string | undefined, stamps: number, slots: number): string {
  const progress = `${stamps} of ${slots}`;
  const room = LINE_LENGTH - progress.length - ": ".length;
  if (name !== undefined && room > 0) return `${name.slice(0, room)}: ${progress}`;
  const withWord = `${progress} stamps`;
  return withWord.length <= LINE_LENGTH ? withWord : progress;
}
