import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Answers, Question } from "../../event/answers.ts";
import type { Connection, ConnectionsGame, ConnectionsWeb } from "../../event/connections.ts";
import { userKinds } from "../../event/schema.ts";
import { keepKinds } from "../../event/user-kinds.ts";
import type { ConnectionsAnswers } from "./answers.ts";
import { connections, meetingHalves } from "./schema.ts";

/** How long a half waits for the other: the second must come within this of the first. */
export const HALF_WAITS_MS = 2 * 60 * 1000;

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
 * The connections game, with the event's answers game, or null for an event
 * with none, whose connections then have no match.
 *
 * A connection joins two users of different kinds, once. Each tap of one
 * person's phone on the other's token is a half, and the second half within
 * HALF_WAITS_MS of the first makes the connection. Both people's answers are
 * fixed then, in the same transaction, and the match is worked out from them
 * and kept, so a later change can't alter it.
 */
export function connectionsGame(answers: ConnectionsAnswers | null): ConnectionsGame {
  return {
    pointsEach: POINTS_EACH,

    meet: (db, { userId, userKind, ownerId, ownerKind }, now) =>
      db.transaction(async (tx) => {
        // In the order of their IDs, as every lock here is taken, so two halves can't deadlock.
        const [userA, userB] = [userId, ownerId].sort() as [string, string];
        const tapperIsA = userId === userA;

        // Each side's kind is the one it has, or else the hand-off's, which then becomes its own.
        await keepKinds(
          tx,
          [
            { userId, kind: userKind },
            { userId: ownerId, kind: ownerKind },
          ]
            .filter((seen): seen is { userId: string; kind: string } => seen.kind !== null)
            .sort((x, y) => (x.userId < y.userId ? -1 : 1)),
        );
        const kinds = new Map(
          (
            await tx
              .select({ userId: userKinds.userId, kind: userKinds.kind })
              .from(userKinds)
              .where(inArray(userKinds.userId, [userA, userB]))
              // A locking read sees the latest rows, as tap-pipeline.ts's #lockStation explains.
              .for("update")
          ).map((row) => [row.userId, row.kind]),
        );
        const kindA = kinds.get(userA);
        const kindB = kinds.get(userB);
        if (kindA === undefined || kindB === undefined || kindA === kindB) return "same_kind";

        // The pair's row, made if it isn't there, and locked until the transaction ends, so
        // two halves at once, even on two instances, take turns and can't miss each other.
        // The no-op update is only so the insert never fails.
        const pair = and(eq(meetingHalves.userA, userA), eq(meetingHalves.userB, userB));
        await tx
          .insert(meetingHalves)
          .values({ userA, userB })
          .onDuplicateKeyUpdate({ set: { userA: sql`user_a` } });
        const [halves] = await tx.select().from(meetingHalves).where(pair).for("update");
        const [connected] = await tx
          .select({ userA: connections.userA })
          .from(connections)
          .where(and(eq(connections.userA, userA), eq(connections.userB, userB)))
          .for("update");
        if (connected) return "already_connected";

        const otherHalf = tapperIsA ? halves!.bMetAt : halves!.aMetAt;
        if (otherHalf === null || now.getTime() - Date.parse(otherHalf) > HALF_WAITS_MS) {
          await tx
            .update(meetingHalves)
            .set(tapperIsA ? { aMetAt: now.toISOString() } : { bMetAt: now.toISOString() })
            .where(pair);
          return "waiting";
        }

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
        await tx.update(meetingHalves).set({ aMetAt: null, bMetAt: null }).where(pair);
        return "connected";
      }),

    async connectionsOf(db, userId, now) {
      const rows = await db
        .select()
        .from(connections)
        .where(or(eq(connections.userA, userId), eq(connections.userB, userId)))
        .orderBy(desc(connections.connectedAt), desc(connections.userA), desc(connections.userB));
      return rows.map((row): Connection => {
        const sharedAt = new Date(Date.parse(row.connectedAt) + SHARED_AFTER_MS).toISOString();
        return {
          connectedAt: row.connectedAt,
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
