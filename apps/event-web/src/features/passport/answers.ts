import type { Question } from "@/api/types";

/**
 * Agreement 0.13's sentence for a passport whose answers aren't all in yet, where the count
 * is the number of questions, not the number still missing.
 */
export function answerAllSentence(questionCount: number): string {
  return `Answer all ${questionCount} to get your match when you connect.`;
}

/** How many of the event's questions the user has answered. */
export function answeredCount(
  questions: readonly Question[],
  answers: Readonly<Record<string, string>>,
): number {
  return questions.filter((question) => Object.hasOwn(answers, question.id)).length;
}

/**
 * The first question in the event's order that the user hasn't answered and hasn't skipped
 * for now, or null when every one left is skipped. The order is the service's, so the
 * passport asks them in the same order for everyone.
 */
export function nextQuestion(
  questions: readonly Question[],
  answers: Readonly<Record<string, string>>,
  skipped: ReadonlySet<string>,
): Question | null {
  return (
    questions.find(
      (question) => !Object.hasOwn(answers, question.id) && !skipped.has(question.id),
    ) ?? null
  );
}

/** A question's place in the event's list, from 1, or 0 when it isn't one of them. */
export function questionPosition(questions: readonly Question[], questionId: string): number {
  return questions.findIndex((question) => question.id === questionId) + 1;
}
