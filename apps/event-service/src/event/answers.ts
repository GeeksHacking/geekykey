import { eq, sql } from "drizzle-orm";
import { isoNow } from "../db/columns.ts";
import type { Db } from "../db/pool.ts";
import { trimmedText } from "../lib/trimmed-text.ts";
import type { Tx } from "./games.ts";
import { answers } from "./schema.ts";
import type { SessionUser } from "./session-auth.ts";

/*
  The answers game's question and answer for each participant (the API
  agreement's 8.1 and 8.7, spec section 6, "The answers game"). The event's
  questions come from its settings through src/app.ts, as its games do, and
  an event with none has no answers game.
*/

/** The longest answer, in Unicode code points (the API agreement's 8.7). */
const ANSWER_MAX = 60;

/** An answer the user gives: trimmed, then 1 to 60 code points, in any script. */
export const answerSchema = trimmedText(ANSWER_MAX, `answer must be 1 to ${ANSWER_MAX} characters`);

/** A participant's question and answer, as `user.question` and `user.answer` give them. */
export interface OwnQuestion {
  question: string | null;
  answer: string | null;
}

/**
 * The user's question and answer, giving them one of `questions` if they
 * have none yet. Both are null when the event has no answers game, whatever
 * is stored. Each is given once: of two first requests at once, the first
 * write wins, and both answer with it.
 */
export async function questionAndAnswer(
  db: Db,
  user: SessionUser,
  questions: readonly string[],
): Promise<OwnQuestion> {
  if (questions.length === 0) return { question: null, answer: null };
  if (user.question !== null) return { question: user.question, answer: user.answer };

  const picked = questions[Math.floor(Math.random() * questions.length)]!;
  // A user who already has a question keeps it: the no-op update is only so that never fails.
  await db
    .insert(answers)
    .values({ userId: user.id, question: picked })
    .onDuplicateKeyUpdate({ set: { userId: sql`user_id` } });
  const [row] = await db
    .select({ question: answers.question, answer: answers.answer })
    .from(answers)
    .where(eq(answers.userId, user.id));
  return { question: row!.question, answer: row!.answer };
}

/** Sets the user's answer, replacing any earlier one. They must have a question already. */
export async function setAnswer(db: Db | Tx, userId: string, answer: string): Promise<void> {
  await db.update(answers).set({ answer, answeredAt: isoNow() }).where(eq(answers.userId, userId));
}
