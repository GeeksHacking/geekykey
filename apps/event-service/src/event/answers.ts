import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isoNow } from "../db/columns.ts";
import type { Tx } from "./games.ts";
import { answers } from "./schema.ts";

/*
  The answers game's answers (spec section 6, "The answers game"). Every
  participant gets the same multiple-choice questions, which come from the
  event's settings through src/app.ts, as its games do. An event with none
  has no answers game. A participant can change an answer until their first
  connection, which fixes them, so a match already shown stays true.
*/

export interface Choice {
  /** Stable, so rewording the choice later changes nobody's answer. */
  id: string;
  text: string;
}

export interface Question {
  /** Stable, so rewording the question later changes nobody's answer. */
  id: string;
  text: string;
  /** 2 to 4, in the order the passport shows them. */
  choices: readonly Choice[];
}

/** A participant's answers, from question ID to choice ID, with only the answered questions. */
export type Answers = Readonly<Record<string, string>>;

/**
 * Answers as PATCH /api/v1/me takes them: any of the event's questions, each
 * with one of its choices. An unknown question or choice fails under its
 * question's ID, so the issue's path is `["answers", questionId]`.
 */
export function answersSchema(questions: readonly Question[] | null) {
  const choicesOf = new Map(
    (questions ?? []).map((question) => [
      question.id,
      new Set(question.choices.map((choice) => choice.id)),
    ]),
  );
  return z.record(z.string(), z.string()).superRefine((given, ctx) => {
    for (const [questionId, choiceId] of Object.entries(given)) {
      const choices = choicesOf.get(questionId);
      if (choices?.has(choiceId)) continue;
      ctx.addIssue({
        code: "custom",
        path: [questionId],
        message: choices ? "The question has no choice with this ID" : "No question has this ID",
      });
    }
  });
}

/**
 * The stored answers that are still to one of the event's questions, with
 * one of its choices. A deploy that drops a question or a choice leaves it
 * stored, and this leaves it out, so nobody is shown an ID the list lacks.
 */
export function shownAnswers(stored: Answers, questions: readonly Question[] | null): Answers {
  const shown: Record<string, string> = {};
  for (const question of questions ?? []) {
    const choiceId = stored[question.id];
    if (question.choices.some((choice) => choice.id === choiceId)) shown[question.id] = choiceId!;
  }
  return shown;
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

/**
 * Sets the answers in `given`, keeping the user's others, and gives all their
 * stored answers after. `given` has passed answersSchema(). Once a connection
 * has fixed the answers, it changes nothing and gives `"fixed"`.
 */
export async function setAnswers(
  tx: Tx,
  userId: string,
  given: Answers,
): Promise<Answers | "fixed"> {
  const row = await lockAnswers(tx, userId);
  if (row.fixedAt !== null) return "fixed";
  if (Object.keys(given).length === 0) return row.choices;
  const choices = { ...row.choices, ...given };
  await tx.update(answers).set({ choices }).where(eq(answers.userId, userId));
  return choices;
}

/**
 * Fixes the user's answers, so they can no longer change them, and gives
 * them as shownAnswers() does. The connections game calls it for both people
 * in the transaction that makes their connection, and works out the match
 * from what it gives: the lock means no change can land between the two.
 * Fixing answers already fixed gives them again.
 */
export async function fixAnswers(
  tx: Tx,
  userId: string,
  questions: readonly Question[] | null,
): Promise<Answers> {
  const row = await lockAnswers(tx, userId);
  if (row.fixedAt === null) {
    await tx.update(answers).set({ fixedAt: isoNow() }).where(eq(answers.userId, userId));
  }
  return shownAnswers(row.choices, questions);
}
