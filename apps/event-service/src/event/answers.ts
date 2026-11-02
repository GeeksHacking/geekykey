import { z } from "zod";
import type { Db } from "../db/pool.ts";
import type { Tx } from "./games.ts";

/*
  What the base knows of the answers game (spec section 6, "The answers
  game"): the questions every participant gets, which /me gives, and the
  answers PATCH /api/v1/me sets (the API agreement's 8.1 and 8.7). The game
  itself, with its records, lives with connections (src/games/connections/),
  and src/app.ts hands it in, as it does the games. An event without it gives
  no questions.
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

export interface AnswersGame {
  /** The same for every participant, in the order the passport asks them. */
  readonly questions: readonly Question[];
  /** The user's answers, to the questions and choices still on the list. */
  answersOf(db: Db | Tx, userId: string): Promise<Answers>;
  /**
   * Sets the answers in `given`, which has passed answersSchema(), keeping the
   * user's others, and gives all their answers after. Once their first
   * connection has fixed them, it changes nothing and gives `"fixed"`.
   */
  setAnswers(tx: Tx, userId: string, given: Answers): Promise<Answers | "fixed">;
}

/**
 * Answers as PATCH /api/v1/me takes them: any of the game's questions, each
 * with one of its choices. An unknown question or choice fails under its
 * question's ID, so the issue's path is `["answers", questionId]`. With no
 * answers game, every question is unknown.
 */
export function answersSchema(game: AnswersGame | null) {
  const choicesOf = new Map(
    (game?.questions ?? []).map((question) => [
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
