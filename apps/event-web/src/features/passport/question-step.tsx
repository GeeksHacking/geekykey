import { Check } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import type { Question } from "@/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One of the answers game's questions, with each choice as a button (agreement 0.13's
 * section 13). A tap answers it and the passport moves on; Skip leaves it for later. When
 * it is opened to change an answer, the current choice is marked and Cancel replaces Skip.
 */
export function QuestionStep({
  question,
  position,
  total,
  pending,
  error,
  selectedChoiceId,
  autoFocus = false,
  onAnswer,
  onSkip,
  onCancel,
}: {
  question: Question;
  /** Its place in the event's list, from 1. */
  position: number;
  total: number;
  pending: boolean;
  error: string | null;
  /** The choice already stored, when the step is open to change it. */
  selectedChoiceId?: string;
  /** Focus the heading when this mounts, for a step opened from the summary. */
  autoFocus?: boolean;
  onAnswer: (choiceId: string) => void;
  onSkip?: () => void;
  onCancel?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(question.id);

  // A tap removes the button that had focus. Move it to the next question so a keyboard
  // or screen-reader user knows what is being asked. The first question is left alone, so
  // the name field above keeps focus while both prompts are on screen.
  useEffect(() => {
    if (!autoFocus && previous.current === question.id) return;
    previous.current = question.id;
    heading.current?.focus();
  }, [autoFocus, question.id]);

  return (
    <div className="mt-4">
      <p className="look-label text-xs text-muted-foreground">
        Question {position} of {total}
      </p>
      <h3
        ref={heading}
        tabIndex={-1}
        className="type-item mt-1 text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {question.text}
      </h3>
      <div className="mt-3 grid gap-2">
        {question.choices.map((choice) => {
          const selected = choice.id === selectedChoiceId;
          return (
            <Button
              key={choice.id}
              type="button"
              variant="outline"
              aria-pressed={selectedChoiceId === undefined ? undefined : selected}
              className={cn(
                "h-auto min-h-10 w-full justify-start whitespace-normal px-4 py-3 text-left",
                selected && "border-primary-edge bg-accent",
              )}
              disabled={pending}
              onClick={() => onAnswer(choice.id)}
            >
              {choice.text}
              {selected ? <Check aria-hidden className="ml-auto" /> : null}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-3">
        {onSkip ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onSkip}>
            Skip this question
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
