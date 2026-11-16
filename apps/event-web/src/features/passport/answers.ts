import type { Question } from "@/api/types";

/**
 * Agreement 0.13's sentence for a passport whose answers aren't all in yet, where the count
 * is the number of questions, not the number still missing.
 */
export function answerAllSentence(questionCount: number): string {
  return `Answer all ${questionCount} to get your match when you connect.`;
}

export const HINT_HUNT_NOTICE =
  "Your answers may be used as hints in the hint hunt, a station game, but only if you tap in to play it.";

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
