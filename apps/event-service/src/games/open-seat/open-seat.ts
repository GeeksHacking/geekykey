import { randomInt } from "node:crypto";
import { LINE_LENGTH, SECONDS_LEFT, type Countdown } from "@geekykey/handoff";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../../db/pool.ts";
import type { RequestRule } from "../../event/connections.ts";
import { DEFAULT_DISPLAY_NAME, forTheScreen, greetingNames } from "../../event/display-names.ts";
import type { GameDeps, GameStatus, StationText, Tx } from "../../event/games.ts";
import { groupsOf } from "../../event/groups.ts";
import type { MySeat, OpenSeatGame } from "../../event/open-seat.ts";
import { stations, users } from "../../event/schema.ts";
import { openSeatLock, openSeats } from "./schema.ts";

/** BAC-190's timings, together for the API agreement's section 4. */
export const OPEN_SEAT_RULES = {
  /** How long a seat stays open with nobody taking it. */
  openMs: 60_000,
  /** How long the station shows the prompt once the seat is taken. */
  promptSeconds: 20,
  /**
   * A tap made longer ago than this, such as a saved tap a station sends once it is back online,
   * opens and takes nothing, so a seat that closed meanwhile isn't opened again.
   */
  savedTapMs: 10_000,
};

/**
 * What the two ask each other once a seat is taken, one string per screen line. Never drawn from
 * anyone's answers, so the answers game's reveal is untouched (BAC-190).
 */
export const PROMPTS: readonly (readonly string[])[] = [
  ["What are you", "building?"],
  ["What's the best", "thing here?"],
  ["What got you", "into tech?"],
  ["What would you", "build next?"],
  ["Which booth", "should I visit?"],
];

const IDLE_LINES = ["Open seat", "Tap to sit"];

/**
 * A station that knows countdowns shows one in place of the lines (agreement 6.1), so each
 * countdown carries the instruction itself, and the lines say the same for one that doesn't.
 */
const SITTER_LINES = ["Seat open", "Wait here"];
const SITTER_COUNTDOWN = ["Seat open", `Wait here ${SECONDS_LEFT}s`];
const GO_THERE = "Tap there";
const GO_THERE_COUNTDOWN = `Tap there ${SECONDS_LEFT}s`;

type Seat = typeof openSeats.$inferSelect;
type Station = typeof stations.$inferSelect;

/** The station's place on a screen: its booth, else its label, as a screen can show them. */
function placeOf(station: Pick<Station, "booth" | "label"> | undefined) {
  const place =
    (station?.booth ? forTheScreen(station.booth) : null) ??
    (station ? forTheScreen(station.label) : null) ??
    "another stn";
  // A literal {s} would read as a countdown's seconds (agreement 6.1).
  return place.replaceAll(SECONDS_LEFT, "(s)");
}

/** "Open seat at X" when the place fits, else as much of it as fits after "Seat at ". */
function openSeatAt(place: string) {
  const long = `Open seat at ${place}`;
  return long.length <= LINE_LENGTH ? long : `Seat at ${place}`.slice(0, LINE_LENGTH);
}

/** Two first names on one line, each cut only as far as the other needs. */
function bothNames(a: string, b: string) {
  const room = LINE_LENGTH - " & ".length;
  const first = a.slice(0, Math.max(Math.ceil(room / 2), room - b.length));
  return `${first} & ${b.slice(0, room - first.length)}`;
}

/** The seat's own countdown at `now`: the seconds until it closes, then the idle screen. */
function seatCountdown(seat: Seat, lines: string[], now: Date): Countdown {
  return {
    seconds: Math.max(1, Math.ceil((Date.parse(seat.closesAt) - now.getTime()) / 1000)),
    lines,
    ending: IDLE_LINES,
  };
}

/** The enabled stations running the open seat, oldest first. */
function openSeatStations(db: Db | Tx) {
  return db
    .select()
    .from(stations)
    .where(and(eq(stations.game, "open_seat"), isNull(stations.disabledAt)))
    .orderBy(asc(stations.createdAt), asc(stations.id));
}

/** One seat per event, after the pipeline's station lock, as the relay's lock is taken. */
async function lockSeats(tx: Tx) {
  await tx
    .insert(openSeatLock)
    .values({ id: 1 })
    .onDuplicateKeyUpdate({ set: { id: sql`${openSeatLock.id}` } });
  await tx.select().from(openSeatLock).where(eq(openSeatLock.id, 1)).for("update");
}

/** The newest seat, open or not, locked until the ingest ends. */
async function latestSeat(tx: Tx): Promise<Seat | undefined> {
  const [seat] = await tx
    .select()
    .from(openSeats)
    .orderBy(desc(openSeats.openedAt), desc(openSeats.id))
    .limit(1)
    .for("update");
  return seat;
}

function isOpen(seat: Seat, at: Date) {
  return seat.takenAt === null && at.toISOString() < seat.closesAt;
}

/**
 * The open seat's rule for the request a taken seat sends (the API agreement's section 4,
 * "Connections", BAC-190): the two may connect unless
 * they are in the same group. Someone with no group may connect with anyone. Being connected
 * already is the connections game's own check. Read without locks, as the connection rule reads
 * the groups.
 */
export const openSeatRequests: RequestRule = {
  async judge(tx, { requestId, fromId, toId }) {
    const [seat] = await tx
      .select({ id: openSeats.id })
      .from(openSeats)
      .where(eq(openSeats.requestId, requestId))
      .limit(1);
    if (!seat) return null;
    const groups = await groupsOf(tx, [fromId, toId]);
    const [from, to] = [groups.get(fromId), groups.get(toId)];
    return { refusal: from !== undefined && from === to ? "same_group" : null };
  },
  async connected(tx, requestId, now) {
    await tx
      .update(openSeats)
      .set({ acceptedAt: now.toISOString() })
      .where(and(eq(openSeats.requestId, requestId), isNull(openSeats.acceptedAt)));
  },
};

/**
 * The open seat (BAC-190, the API agreement's section 4): a tap at an open seat station opens a
 * seat for a minute, which the other open seat stations announce with no name, and someone from
 * another group, or with none, takes it by tapping the same station. Taking it sends the sitter
 * a connection request from the taker, and the station shows the two a prompt. One seat is open
 * at a time across the event. Its taps give no points and no stamp.
 */
export function openSeatGame({
  stationMessages,
  connections,
  isReady,
  pickPrompt = (prompts) => prompts[randomInt(prompts.length)]!,
  rules: overrides,
}: GameDeps & {
  pickPrompt?: (prompts: typeof PROMPTS) => readonly string[];
  rules?: Partial<typeof OPEN_SEAT_RULES>;
}): OpenSeatGame {
  const rules = { ...OPEN_SEAT_RULES, ...overrides };
  // judge and lines get different context objects, but share the ingest's transaction.
  const textByTransaction = new WeakMap<Tx, Map<string, StationText>>();

  return {
    id: "open_seat",
    idleLines: IDLE_LINES,

    async judge(taps, context) {
      const { tx, now, stationId } = context;
      // Configuration before the seat lock, as the relay reads it, so no station row is locked here.
      const seatStations = await openSeatStations(tx);
      const others = seatStations.filter((s) => s.id !== stationId);
      await lockSeats(tx);
      const texts = new Map<string, StationText>();
      textByTransaction.set(tx, texts);
      const statuses: GameStatus[] = taps.map(() => "no_game");

      for (const { tap, index } of taps
        .map((tap, index) => ({ tap, index }))
        .sort((a, b) => a.tap.effectiveAt.localeCompare(b.tap.effectiveAt))) {
        if (now.getTime() - Date.parse(tap.effectiveAt) > rules.savedTapMs) continue;
        const seat = await latestSeat(tx);
        // `now` was taken before the ingest waited for the seat lock, so a tap judged after
        // another station's is never earlier than it.
        const at = new Date(
          Math.max(now.getTime(), seat ? Date.parse(seat.takenAt ?? seat.openedAt) : 0),
        );
        const hold = (lines: string[], countdown?: Countdown) => {
          statuses[index] = "cooldown";
          texts.set(tap.clientTapId, { lines, complete: false, ...(countdown && { countdown }) });
        };

        const open = seat && isOpen(seat, at) ? seat : null;
        if (open === null) {
          if (!(await isReady(tx, tap.userId))) {
            hold(["Finish setup", "on your phone"]);
            continue;
          }
          // Strictly after the last seat, so the newest seat is always the one opened last.
          const openedAt = new Date(
            Math.max(at.getTime(), seat ? Date.parse(seat.openedAt) + 1 : 0),
          );
          const opened: Seat = {
            id: crypto.randomUUID(),
            stationId,
            sitterId: tap.userId,
            openedAt: openedAt.toISOString(),
            closesAt: new Date(openedAt.getTime() + rules.openMs).toISOString(),
            takerId: null,
            takenAt: null,
            prompt: null,
            requestId: null,
            acceptedAt: null,
          };
          await tx.insert(openSeats).values(opened);
          statuses[index] = "accepted";
          texts.set(tap.clientTapId, {
            lines: SITTER_LINES,
            complete: false,
            countdown: seatCountdown(opened, SITTER_COUNTDOWN, openedAt),
          });
          const here = openSeatAt(placeOf(seatStations.find((s) => s.id === stationId)));
          const countdown = seatCountdown(opened, [here, GO_THERE_COUNTDOWN], openedAt);
          for (const other of others) {
            context.afterCommit(() =>
              stationMessages.send(other.id, {
                lines: [here, GO_THERE],
                countdown,
                beep: true,
              }),
            );
          }
          continue;
        }

        if (open.stationId !== stationId) {
          // The same words the seat's announcement gave this station.
          const there = openSeatAt(placeOf(seatStations.find((s) => s.id === open.stationId)));
          hold([there, GO_THERE], seatCountdown(open, [there, GO_THERE_COUNTDOWN], at));
          continue;
        }
        if (open.sitterId === tap.userId) {
          hold(SITTER_LINES, seatCountdown(open, SITTER_COUNTDOWN, at));
          continue;
        }
        if (!(await isReady(tx, tap.userId))) {
          hold(["Finish setup", "on your phone"]);
          continue;
        }
        const groups = await groupsOf(tx, [open.sitterId, tap.userId]);
        const sitterGroup = groups.get(open.sitterId);
        if (sitterGroup !== undefined && sitterGroup === groups.get(tap.userId)) {
          hold(["Same team", "Find another"]);
          continue;
        }
        const request = connections
          ? await connections.requestFor(tx, { fromId: tap.userId, toId: open.sitterId }, at)
          : null;
        if (request?.status === "already_connected") {
          hold(["Already met", "Find another"]);
          continue;
        }

        const prompt = [...pickPrompt(PROMPTS)];
        const atIso = at.toISOString();
        await tx
          .update(openSeats)
          .set({
            takerId: tap.userId,
            takenAt: atIso,
            prompt,
            // A request of the sitter's that connected the two at once isn't the seat's own.
            requestId: request?.status === "waiting" ? request.requestId : null,
            acceptedAt: request?.status === "connected" ? atIso : null,
          })
          .where(eq(openSeats.id, open.id));
        const names = await greetingNames(tx, [open.sitterId, tap.userId]);
        statuses[index] = "accepted";
        texts.set(tap.clientTapId, {
          lines: [
            "Seat taken!",
            bothNames(
              names.get(open.sitterId) ?? DEFAULT_DISPLAY_NAME,
              names.get(tap.userId) ?? DEFAULT_DISPLAY_NAME,
            ),
          ],
          complete: false,
        });
        // The prompt follows the names. A station shows a message that comes in the tap's first
        // 2 seconds once they end (HAR-51), and a countdown keeps it up past a message's 2 seconds.
        context.afterCommit(() =>
          stationMessages.send(stationId, {
            lines: prompt,
            countdown: { seconds: rules.promptSeconds, lines: prompt, ending: IDLE_LINES },
          }),
        );
        for (const other of others) {
          context.afterCommit(() => stationMessages.send(other.id, { lines: ["Seat taken"] }));
        }
      }
      return statuses;
    },

    async lines(taps, { tx }) {
      return taps.map((tap) => textByTransaction.get(tx)?.get(tap.clientTapId) ?? null);
    },

    async seatOf(db, userId, now): Promise<MySeat | null> {
      const [seat] = await db
        .select()
        .from(openSeats)
        .where(or(eq(openSeats.sitterId, userId), eq(openSeats.takerId, userId)))
        .orderBy(desc(openSeats.openedAt), desc(openSeats.id))
        .limit(1);
      if (!seat) return null;
      const role = seat.sitterId === userId ? "sitter" : "taker";
      const otherId = role === "sitter" ? seat.takerId : seat.sitterId;
      const [[station], [other]] = await Promise.all([
        db.select({ booth: stations.booth }).from(stations).where(eq(stations.id, seat.stationId)),
        otherId === null
          ? [undefined]
          : db.select({ displayName: users.displayName }).from(users).where(eq(users.id, otherId)),
      ]);
      return {
        status:
          seat.takenAt !== null ? "taken" : now.toISOString() < seat.closesAt ? "open" : "closed",
        role,
        stationId: seat.stationId,
        booth: station?.booth ?? null,
        openedAt: seat.openedAt,
        closesAt: seat.closesAt,
        takenAt: seat.takenAt,
        otherDisplayName: otherId === null ? null : (other?.displayName ?? DEFAULT_DISPLAY_NAME),
        prompt: seat.prompt?.join(" ") ?? null,
      };
    },

    async openNow(db, now) {
      const [seat] = await db
        .select({ stationId: openSeats.stationId, closesAt: openSeats.closesAt })
        .from(openSeats)
        .where(and(isNull(openSeats.takenAt), sql`${openSeats.closesAt} > ${now.toISOString()}`))
        .orderBy(desc(openSeats.openedAt), desc(openSeats.id))
        .limit(1);
      return seat ?? null;
    },
  };
}
