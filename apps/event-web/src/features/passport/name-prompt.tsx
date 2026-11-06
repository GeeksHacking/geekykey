import { Button } from "@/components/ui/button";
import { AvatarColourPicker } from "@/features/passport/avatar/avatar-colour-picker";
import { DisplayNameForm } from "@/features/passport/display-name-form";

/**
 * The name step in participant setup (the API agreement's section 13, BAC-144).
 * Organizers keep their existing inline prompt with Skip. Avatar colours apply without Save.
 */
export function NamePrompt({ userId, onSkip }: { userId: string; onSkip?: () => void }) {
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
            onSkip ? (
              <Button type="button" variant="ghost" onClick={onSkip}>
                Skip
              </Button>
            ) : undefined
          }
        />
        <AvatarColourPicker userId={userId} />
      </div>
    </section>
  );
}
