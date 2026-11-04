import type { Question } from "@/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The answers already given, one row per question in the event's order (agreement 0.13's
 * section 13). Before the first connection each row can be changed; after it, the rows are
 * read-only. A question fixed before it was answered says so rather than pretending.
 */
export function AnswersSummary({
  questions,
  answers,
  editable,
  pending = false,
  onChange,
}: {
  questions: readonly Question[];
  answers: Readonly<Record<string, string>>;
  editable: boolean;
  /** Disable Change while an answer is being sent, so its answer cannot close a new step. */
  pending?: boolean;
  onChange?: (questionId: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm text-muted-foreground">
        {editable
          ? "You can change these until your first connection."
          : "You've connected, so your answers are set."}
      </p>
      <ul className="mt-3 divide-y rounded-md border">
        {questions.map((question) => {
          const choice = question.choices.find(
            (candidate) => candidate.id === answers[question.id],
          );
          return (
            <li key={question.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{question.text}</p>
                <p
                  className={cn(
                    "text-sm",
                    choice ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {choice?.text ?? "Not answered"}
                </p>
              </div>
              {editable && onChange ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Change answer to "${question.text}"`}
                  disabled={pending}
                  onClick={() => onChange(question.id)}
                >
                  Change
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
