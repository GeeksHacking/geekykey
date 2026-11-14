import { PersonLines } from "@/features/passport/person-lines";

interface PersonCardProps {
  name: string;
  bio: string | null;
  contactLine?: string | null;
}

/**
 * One person as the Connections tab draws them (FRO-182): the place for their avatar, then their
 * name, bio and contact line at the card's size. The Profile tab's "How others see you" is the
 * same card, filled with the user's own name and bio (FRO-184). The avatar is a place until
 * FRO-181 draws one.
 */
export function PersonCard({ name, bio, contactLine = null }: PersonCardProps) {
  return (
    <div className="flex items-start gap-3">
      <div aria-hidden className="size-14 shrink-0 rounded-md bg-muted" />
      <div className="min-w-0 flex-1">
        <PersonLines name={name} bio={bio} contactLine={contactLine} bioSize="lead" />
      </div>
    </div>
  );
}
