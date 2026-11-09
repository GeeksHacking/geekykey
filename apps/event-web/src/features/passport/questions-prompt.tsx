import { useState } from "react";

import { describeError, isApiErrorCode } from "@/api/errors";
import type { Question } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { Button } from "@/components/ui/button";
import { AnswersSummary } from "@/features/passport/answers-summary";
import { answerAllSentence, nextQuestion, questionPosition } from "@/features/passport/answers";
import { QuestionStep } from "@/features/passport/question-step";
import { useUpdateMe } from "@/features/passport/use-update-me";

/**
 * The answers game's questions on the passport (agreement 0.13, 8.1, 8.7 and section 13).
 * One question at a time, after the name prompt, with each choice as a button. A tap sends
 * that one answer and moves on. Skip leaves the question for later, and when every question
 * left is skipped the card collapses to a way back in.
 *
 * Once every question is answered it lists them, with a way to change each one. The user's
 * first connection fixes them, and `409 answers_fixed` says the same thing when a connection
 * lands between two polls, so either turns the list read-only.
 */
export function QuestionsPrompt({
  questions,
  answers,
  answersFixed = false,
  onAnswersFixed,
  required = false,
}: {
  questions: Question[];
  answers: Record<string, string>;
  answersFixed?: boolean;
  /** The participant setup step cannot leave a question for later. */
  required?: boolean;
  /** Read /me again after a 409, so the connection that fixed the answers lands in the cache. */
  onAnswersFixed: () => void;
}) {
  const updateMe = useUpdateMe();
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fixedByService, setFixedByService] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (questions.length === 0) return null;

  const locked = answersFixed || fixedByService;
  const fixed = !required && locked;
  const answeredQuestions = questions.filter((question) => Object.hasOwn(answers, question.id));
  const answered = answeredQuestions.length;
  const complete = answered === questions.length;
  const current = nextQuestion(questions, answers, required ? new Set() : skipped);
  const editing = editingId
    ? (questions.find((question) => question.id === editingId) ?? null)
    : null;
  const position = current ? questionPosition(questions, current.id) : 0;

  function startEditing(questionId: string) {
    setError(null);
    setEditingId(questionId);
  }

  async function answer(question: Question, choiceId: string) {
    setError(null);
    try {
      await updateMe.mutateAsync({ answers: { [question.id]: choiceId } });
      setSkipped((previous) => {
        const next = new Set(previous);
        next.delete(question.id);
        return next;
      });
      setEditingId(null);
    } catch (reason) {
      if (isApiErrorCode(reason, "answers_fixed")) {
        setFixedByService(true);
        setEditingId(null);
        onAnswersFixed();
        return;
      }
      setError(describeError(reason));
    }
  }

  function skip() {
    if (!current) return;
    setError(null);
    setSkipped((previous) => new Set(previous).add(current.id));
  }

  return (
    <section
      aria-labelledby="answers-heading"
      // Setup has nothing else on the page, so it's a card there. On a screen, it's one more section.
      className={required ? "rounded-lg border bg-card p-4 text-card-foreground sm:p-5" : undefined}
    >
      {/* A card has its own edge, so only the section on a screen takes the marker. */}
      {required ? (
        <h2 id="answers-heading" className="type-section">
          Your answers
        </h2>
      ) : (
        <SectionHeading id="answers-heading" title="Your answers" className="mb-0" />
      )}
      {fixed ? (
        <AnswersSummary questions={questions} answers={answers} editable={false} />
      ) : editing ? (
        <QuestionStep
          question={editing}
          position={questionPosition(questions, editing.id)}
          total={questions.length}
          pending={updateMe.isPending}
          error={error}
          selectedChoiceId={answers[editing.id]}
          autoFocus
          onAnswer={(choiceId) => void answer(editing, choiceId)}
          onCancel={() => {
            setEditingId(null);
            setError(null);
          }}
        />
      ) : complete ? (
        <AnswersSummary
          questions={questions}
          answers={answers}
          editable
          pending={updateMe.isPending}
          onChange={startEditing}
        />
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {answerAllSentence(questions.length)}
          </p>
          {current ? (
            <QuestionStep
              question={current}
              position={position}
              total={questions.length}
              pending={updateMe.isPending}
              error={error}
              autoFocus={required}
              onAnswer={(choiceId) => void answer(current, choiceId)}
              onSkip={required ? undefined : skip}
            />
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {answered} of {questions.length} answered.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSkipped(new Set());
                  setError(null);
                }}
              >
                Answer the rest
              </Button>
            </div>
          )}
          {answeredQuestions.length > 0 ? (
            <AnswersSummary
              questions={answeredQuestions}
              answers={answers}
              editable={!locked}
              pending={updateMe.isPending}
              onChange={locked ? undefined : startEditing}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
