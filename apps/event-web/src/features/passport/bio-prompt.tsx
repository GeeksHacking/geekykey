import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/features/passport/profile-form";

/**
 * The bio step in participant setup (FRO-186): after the name and the answers, a participant
 * with neither a bio nor a contact line is asked for them once. Save needs one of the two, and
 * Skip opens the event.
 */
export function BioPrompt({
  bio,
  contactLine,
  onSkip,
}: {
  bio: string | null;
  contactLine: string | null;
  onSkip: () => void;
}) {
  return (
    <section
      aria-labelledby="bio-prompt-heading"
      className="rounded-lg border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="bio-prompt-heading" className="type-section">
        Your bio
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Say what you're working on, and how people can reach you.
      </p>
      <div className="mt-4">
        <ProfileForm
          bio={bio}
          contactLine={contactLine}
          requireOne
          contactLineHint="Only people you connect with see this."
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
