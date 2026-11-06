import type { Tx } from "./games.ts";
import type { Db } from "../db/pool.ts";
import type { AnswersGame } from "./answers.ts";
import { ownNameOf } from "./display-names.ts";

/** Whether a participant has their name and every answer (the API agreement's 11.10, BAC-144). */
export async function participantIsReady(
  db: Db | Tx,
  userId: string,
  game: AnswersGame | null,
): Promise<boolean> {
  if ((await ownNameOf(db, userId)) === null) return false;
  if (game === null) return true;
  const answers = await game.answersOf(db, userId);
  return game.questions.every(({ id }) => Object.hasOwn(answers, id));
}
