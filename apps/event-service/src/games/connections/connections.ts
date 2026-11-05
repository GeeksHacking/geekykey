import type { MeetingStatus } from "@geekykey/handoff";
import { and, asc, desc, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import type { Answers, Question } from "../../event/answers.ts";
import type { Db } from "../../db/pool.ts";
import { loadConnectAcross } from "../../event/connect-across.ts";
import type {
  AcceptStatus,
  Connection,
  ConnectionRequest,
  ConnectionsGame,
  ConnectionsWeb,
  RequestAnswer,
} from "../../event/connections.ts";
import { DEFAULT_DISPLAY_NAME } from "../../event/display-names.ts";
import type { Tx } from "../../event/games.ts";
import { groupsOf } from "../../event/groups.ts";
import { users, userKinds } from "../../event/schema.ts";
import { keepKinds } from "../../event/user-kinds.ts";
import type { ConnectionsAnswers } from "./answers.ts";
import { connections, meetingHalves } from "./schema.ts";

/** How long after a connection /me gives what the two share, so they talk first. */
export const SHARED_AFTER_MS = 2 * 60 * 1000;

/** What each connection adds to a user's points, whatever the match. */
export const POINTS_EACH = 1;

/**
 * The match between two people's answers: the questions both answered with
 * the same choice, out of those both answered, as a whole percent, with the
 * IDs of the same ones in the questions' order. Null when no question was
 * answered by both, as when either answered nothing.
 */
export function matchOf(
  questions: readonly Question[],
  a: Answers,
  b: Answers,
): { match: number | null; shared: string[] } {
  const both = questions.filter(({ id }) => a[id] !== undefined && b[id] !== undefined);
  const shared = both.filter(({ id }) => a[id] === b[id]).map(({ id }) => id);
  if (both.length === 0) return { match: null, shared };
  return { match: Math.round((100 * shared.length) / both.length), shared };
}

/**
 * The user's kind, locked until `tx` ends: the one they have, or else
 * `given`, the hand-off's, which then becomes theirs (11.10). Null when
 * they have none and none is given.
 */
async function lockKind(tx: Tx, userId: string, given: string | null): Promise<string | null> {
  if (given !== null) await keepKinds(tx, [{ userId, kind: given }]);
  const [row] = await tx
    .select({ kind: userKinds.kind })
    .from(userKinds)
    .where(eq(userKinds.userId, userId))
    // A locking read sees the latest rows, as tap-pipeline.ts's #lockStation explains.
    .for("update");
  return row?.kind ?? null;
}

/** Two users, the smaller ID first, with the condition that finds their row. */
interface Pair {
  userA: string;
  userB: string;
  where: SQL;
}

function pairOf(oneUser: string, otherUser: string): Pair {
  const [userA, userB] = [oneUser, otherUser].sort() as [string, string];
  return {
    userA,
    userB,
    where: and(eq(meetingHalves.userA, userA), eq(meetingHalves.userB, userB))!,
  };
}

/** The statuses that say the connection rule refuses the two (11.10). */
type Refusal = Extract<MeetingStatus, "same_kind" | "same_group" | "no_group">;

/**
 * Whether the rule lets the two connect, with each one's kind, locked until `tx`
 * ends. This comes first in a transaction, since it reads the rule and the groups
 * before any lock, so they're as they were at this half or accept: on TiDB a plain
 * read sees the transaction's start, and on MySQL its first read (groups.ts, at
 * lockAllocation).
 *
 * Every lock here and in lockHalves() is taken in one order: each user's kind, by
 * ID, then the pair's row, then each user's answers, by ID. So no two transactions,
 * of one pair or of two that share someone, can each hold a lock the other waits for.
 */
async function judge(tx: Tx, { userA, userB }: Pair, given: ReadonlyMap<string, string | null>) {
  const across = await loadConnectAcross(tx);
  const groups = across === "groups" ? await groupsOf(tx, [userA, userB]) : null;
  // One user at a time, so a half with no kind for one of them takes the same order.
  const kindA = await lockKind(tx, userA, given.get(userA) ?? null);
  const kindB = await lockKind(tx, userB, given.get(userB) ?? null);
  let refusal: Refusal | null = null;
  if (groups) {
    const [groupA, groupB] = [groups.get(userA), groups.get(userB)];
    if (groupA === undefined || groupB === undefined) refusal = "no_group";
    else if (groupA === groupB) refusal = "same_group";
  } else if (kindA === null || kindB === null || kindA === kindB) refusal = "same_kind";
  return { kindA, kindB, refusal };
}

/**
 * The pair's row, made if it isn't there, and locked until the transaction ends, so
 * two halves at once, even on two instances, take turns and can't miss each other. With
 * it, whether the two are connected already, read under the same lock.
 */
async function lockHalves(tx: Tx, { userA, userB, where }: Pair) {
  // The no-op update is only so the insert never fails.
  await tx
    .insert(meetingHalves)
    .values({ userA, userB })
    .onDuplicateKeyUpdate({ set: { userA: sql`user_a` } });
  const [halves] = await tx.select().from(meetingHalves).where(where).for("update");
  const [connected] = await tx
    .select({ userA: connections.userA })
    .from(connections)
    .where(and(eq(connections.userA, userA), eq(connections.userB, userB)))
    .for("update");
  return { halves: halves!, connected: connected !== undefined };
}

/** The rows with a request waiting for the user: one the other person in the row sent. */
function requestsWaitingFor(userId: string) {
  return and(
    isNotNull(meetingHalves.requestId),
    or(
      and(eq(meetingHalves.userA, userId), isNotNull(meetingHalves.bMetAt)),
      and(eq(meetingHalves.userB, userId), isNotNull(meetingHalves.aMetAt)),
    ),
  );
}

/**
 * The pair of a request that waits for the user, or null. A plain read before any lock, to learn
 * whose locks to take, so anything that changes the request reads it again by the pair's row. An
 * update that found its row through the request's own index could wait on a lock in the wrong order.
 */
async function pairOfRequest(db: Db, { requestId, userId }: RequestAnswer): Promise<Pair | null> {
  const [found] = await db
    .select({ userA: meetingHalves.userA, userB: meetingHalves.userB })
    .from(meetingHalves)
    .where(and(eq(meetingHalves.requestId, requestId), requestsWaitingFor(userId)));
  return found ? pairOf(found.userA, found.userB) : null;
}

/** A pair's row once it has no request waiting. */
const NO_REQUEST = { requestId: null, aMetAt: null, bMetAt: null };

/**
 * The connections game, with the event's answers game, or null for an event
 * with none, whose connections then have no match.
 *
 * A connection joins two users once, and they must be of different kinds, or,
 * when organizers have chosen it, placed in different groups (BAC-140). Each half
 * and each accept is judged by the setting and the groups as they are at that moment.
 * A half sends the token's owner a connection request, which waits with no time limit,
 * and a half back accepts it (the API agreement's section 4, "Connections").
 */
export function connectionsGame(answers: ConnectionsAnswers | null): ConnectionsGame {
  /**
   * The one place a connection is made. Both people's answers are fixed here, in the
   * same transaction, and the match is worked out from them and kept, so a later
   * change can't alter it. The caller holds the pair's row.
   */
  async function connect(
    tx: Tx,
    { userA, userB, where }: Pair,
    { kindA, kindB }: { kindA: string | null; kindB: string | null },
    now: Date,
  ) {
    // Fixed in ID order too. The match comes from what fixing gives, under the lock.
    const answersA = answers ? await answers.fixAnswers(tx, userA) : {};
    const answersB = answers ? await answers.fixAnswers(tx, userB) : {};
    const { match, shared } = matchOf(answers?.questions ?? [], answersA, answersB);
    await tx.insert(connections).values({
      userA,
      userB,
      kindA,
      kindB,
      connectedAt: now.toISOString(),
      matchPercent: match,
      shared,
    });
    await tx.update(meetingHalves).set(NO_REQUEST).where(where);
    return "connected" as const;
  }

  return {
    pointsEach: POINTS_EACH,

    meet: (db, { userId, userKind, ownerId, ownerKind }, now) =>
      db.transaction(async (tx) => {
        const pair = pairOf(userId, ownerId);
        const tapperIsA = userId === pair.userA;
        const given = new Map([
          [userId, userKind],
          [ownerId, ownerKind],
        ]);
        const { refusal, kindA, kindB } = await judge(tx, pair, given);
        if (refusal) {
          // A half back counts as accepting, and an accept the rule refuses takes the request.
          await tx
            .update(meetingHalves)
            .set(NO_REQUEST)
            .where(and(pair.where, requestsWaitingFor(userId)));
          return refusal;
        }

        const { halves, connected } = await lockHalves(tx, pair);
        if (connected) return "already_connected";

        const [mine, theirs] = tapperIsA
          ? [halves.aMetAt, halves.bMetAt]
          : [halves.bMetAt, halves.aMetAt];
        if (halves.requestId !== null && theirs !== null) {
          return connect(tx, pair, { kindA, kindB }, now);
        }
        // A half again while this person's request waits changes nothing.
        if (halves.requestId === null || mine === null) {
          const at = now.toISOString();
          await tx
            .update(meetingHalves)
            .set({
              requestId: crypto.randomUUID(),
              aMetAt: tapperIsA ? at : null,
              bMetAt: tapperIsA ? null : at,
            })
            .where(pair.where);
        }
        return "waiting";
      }),

    async accept(db, answer, now) {
      const pair = await pairOfRequest(db, answer);
      if (!pair) return { status: "not_found" };
      const fromId = pair.userA === answer.userId ? pair.userB : pair.userA;

      const status = await db.transaction(async (tx): Promise<AcceptStatus | "not_found"> => {
        // The kinds a half gave are the users' own by now, so an accept brings none.
        const { refusal, kindA, kindB } = await judge(tx, pair, new Map());
        if (refusal) {
          await tx
            .update(meetingHalves)
            .set(NO_REQUEST)
            .where(and(pair.where, eq(meetingHalves.requestId, answer.requestId)));
          return refusal;
        }
        const { halves, connected } = await lockHalves(tx, pair);
        // Another accept or a half back got here first, and took the request with it.
        if (connected) return "already_connected";
        if (halves.requestId !== answer.requestId) return "not_found";
        return connect(tx, pair, { kindA, kindB }, now);
      });
      return status === "not_found" ? { status } : { status, fromId };
    },

    async decline(db, answer) {
      const pair = await pairOfRequest(db, answer);
      if (!pair) return false;
      const [result] = await db
        .update(meetingHalves)
        .set(NO_REQUEST)
        .where(and(pair.where, eq(meetingHalves.requestId, answer.requestId)));
      return result.affectedRows > 0;
    },

    async requestsFor(db, userId) {
      const waiting = await db.select().from(meetingHalves).where(requestsWaitingFor(userId));
      if (waiting.length === 0) return [];

      const asking = waiting.map((row) => ({
        id: row.requestId!,
        fromId: row.userA === userId ? row.userB : row.userA,
        requestedAt: (row.userA === userId ? row.bMetAt : row.aMetAt)!,
      }));
      const names = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(
          inArray(
            users.id,
            asking.map(({ fromId }) => fromId),
          ),
        );
      const nameOf = new Map(names.map(({ id, displayName }) => [id, displayName]));
      return asking
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        .map(({ id, fromId, requestedAt }): ConnectionRequest => ({
          id,
          // A meeting's user may never have logged in here, so may have no row.
          displayName: nameOf.get(fromId) ?? DEFAULT_DISPLAY_NAME,
          requestedAt,
        }));
    },

    async connectionsOf(db, userId, now) {
      const otherId = sql`if(${connections.userA} = ${userId}, ${connections.userB}, ${connections.userA})`;
      const rows = await db
        .select({ row: connections, displayName: users.displayName })
        .from(connections)
        // A left join, since a meeting's user may never have logged in here, so may have no row.
        .leftJoin(users, eq(users.id, otherId))
        .where(or(eq(connections.userA, userId), eq(connections.userB, userId)))
        .orderBy(desc(connections.connectedAt), desc(connections.userA), desc(connections.userB));
      return rows.map(({ row, displayName }): Connection => {
        const sharedAt = new Date(Date.parse(row.connectedAt) + SHARED_AFTER_MS).toISOString();
        return {
          connectedAt: row.connectedAt,
          displayName,
          kind: row.userA === userId ? row.kindB : row.kindA,
          match: row.matchPercent,
          shared: now.toISOString() >= sharedAt ? row.shared : null,
          sharedAt,
        };
      });
    },

    async web(db): Promise<ConnectionsWeb> {
      const rows = await db
        .select({ userA: connections.userA, userB: connections.userB })
        .from(connections)
        .orderBy(asc(connections.connectedAt), asc(connections.userA), asc(connections.userB));
      // Numbered in the order they first connected, which no later connection changes.
      const numbers = new Map<string, number>();
      const numberOf = (userId: string) => {
        if (!numbers.has(userId)) numbers.set(userId, numbers.size + 1);
        return numbers.get(userId)!;
      };
      const links = rows.map(({ userA, userB }): [number, number] => {
        const [a, b] = [numberOf(userA), numberOf(userB)];
        return a < b ? [a, b] : [b, a];
      });
      return { count: rows.length, links };
    },
  };
}
