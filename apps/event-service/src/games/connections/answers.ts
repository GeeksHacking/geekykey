import { eq, sql } from "drizzle-orm";
import { isoNow } from "../../db/columns.ts";
import type { Db } from "../../db/pool.ts";
import type { Answers, AnswersGame, Question } from "../../event/answers.ts";
import type { Tx } from "../../event/games.ts";
import { answers } from "./schema.ts";

/** The answers game, as the base's /me shows and sets it, and as a connection fixes it. */
export interface ConnectionsAnswers extends AnswersGame {
  /**
   * Fixes the user's answers, so they can no longer change them, and gives
   * them as answersOf() does. The connection is made in the same `tx`, for
   * both people, and its match is worked out from what this gives: the lock
   * means no change can land between the two. Fixing answers already fixed
   * gives them again.
   */
  fixAnswers(tx: Tx, userId: string): Promise<Answers>;
}

/**
 * The answers game with `questions`, an event's settings (src/grad-tea/).
 * A participant can change an answer until their first connection.
 */
export function answersGame(questions: readonly Question[]): ConnectionsAnswers {
  /**
   * The stored answers still to one of the questions, with one of its
   * choices. A deploy that drops a question or a choice leaves it stored,
   * and this leaves it out, so nobody is shown an ID the list lacks, and no
   * match counts it.
   */
  const shown = (stored: Answers): Answers => {
    const kept: Record<string, string> = {};
    for (const question of questions) {
      const choiceId = stored[question.id];
      if (question.choices.some((choice) => choice.id === choiceId)) kept[question.id] = choiceId!;
    }
    return kept;
  };

  return {
    questions,

    async answersOf(db: Db | Tx, userId: string) {
      const [row] = await db
        .select({ choices: answers.choices })
        .from(answers)
        .where(eq(answers.userId, userId));
      return shown(row?.choices ?? {});
    },

    async setAnswers(tx, userId, given) {
      const row = await lockAnswers(tx, userId);
      // Older connections could fix incomplete answers. Missing answers can be filled, but
      // an already answered question stays fixed (agreement 8.7, BAC-144).
      const current = shown(row.choices);
      if (
        row.fixedAt !== null &&
        (Object.keys(given).length === 0 ||
          Object.keys(given).some((id) => Object.hasOwn(current, id)))
      )
        return "fixed";
      if (Object.keys(given).length === 0) return shown(row.choices);
      const choices = { ...row.choices, ...given };
      await tx.update(answers).set({ choices }).where(eq(answers.userId, userId));
      return shown(choices);
    },

    async fixAnswers(tx, userId) {
      const row = await lockAnswers(tx, userId);
      if (row.fixedAt === null) {
        await tx.update(answers).set({ fixedAt: isoNow() }).where(eq(answers.userId, userId));
      }
      return shown(row.choices);
    },
  };
}

/**
 * The user's answers row, made empty if they have none, and locked until
 * `tx` ends. Answers change only under this lock, so two changes at once
 * can't lose either, and a connection fixing them waits for a change under
 * way, and the reverse.
 */
async function lockAnswers(tx: Tx, userId: string) {
  // The insert takes the lock even when the row is already there: the no-op update is only so it never fails.
  await tx
    .insert(answers)
    .values({ userId, choices: {} })
    .onDuplicateKeyUpdate({ set: { userId: sql`user_id` } });
  const [row] = await tx
    .select({ choices: answers.choices, fixedAt: answers.fixedAt })
    .from(answers)
    .where(eq(answers.userId, userId))
    .for("update");
  return row!;
}
