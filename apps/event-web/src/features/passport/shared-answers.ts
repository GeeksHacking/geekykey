import type { MeResponse } from "@/api/types";

/**
 * Each question the two share, with the choice both picked. One no longer on the list drops out.
 * Home's row, the Connections tab's card and the person's profile all show them (FRO-182,
 * FRO-183).
 */
export function sharedAnswers(shared: string[], me: MeResponse) {
  return shared.flatMap((id) => {
    const question = me.questions?.find((candidate) => candidate.id === id);
    const choice = question?.choices.find((candidate) => candidate.id === me.user.answers[id]);
    return question && choice ? [{ id, question: question.text, choice: choice.text }] : [];
  });
}
