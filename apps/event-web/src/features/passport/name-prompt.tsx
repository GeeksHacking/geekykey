import { Button } from "@/components/ui/button";
import { DisplayNameForm } from "@/features/passport/display-name-form";

/**
 * Agreement 13: when `has_name` is false the passport asks for a name, with Save and Skip.
 * It sits above the stamps rather than in front of them, so it never blocks the passport.
 */
export function NamePrompt({ onSkip }: { onSkip: () => void }) {
  return (
    <section
      aria-labelledby="name-prompt-heading"
      className="rounded-lg border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="name-prompt-heading" className="text-lg font-semibold tracking-heading">
        What should we call you?
      </h2>
      <div className="mt-3">
        <DisplayNameForm
          secondaryAction={
            <Button type="button" variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          }
        />
      </div>
    </section>
  );
}
