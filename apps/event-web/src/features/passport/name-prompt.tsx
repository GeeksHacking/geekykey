import { Button } from "@/components/ui/button";
import { AvatarColourPicker } from "@/features/passport/avatar/avatar-colour-picker";
import { DisplayNameForm } from "@/features/passport/display-name-form";

/**
 * Agreement 13: when `has_name` is false the passport asks for a name, with Save and Skip.
 * It sits above the stamps rather than in front of them, so it never blocks the passport.
 * Beside it, the guest picks their avatar's colours (FRO-105), which apply at once and need
 * no Save.
 */
export function NamePrompt({ userId, onSkip }: { userId: string; onSkip: () => void }) {
  return (
    <section
      aria-labelledby="name-prompt-heading"
      className="rounded-lg border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="name-prompt-heading" className="text-lg font-semibold tracking-heading">
        What should we call you?
      </h2>
      <div className="mt-3 grid gap-6 md:grid-cols-2">
        <DisplayNameForm
          secondaryAction={
            <Button type="button" variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          }
        />
        <AvatarColourPicker userId={userId} />
      </div>
    </section>
  );
}
