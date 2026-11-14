import type { AvatarLook } from "@/api/types";
import { PersonAvatar } from "@/features/passport/avatar/person-avatar";
import { PersonLines } from "@/features/passport/person-lines";

interface PersonCardProps {
  name: string;
  bio: string | null;
  contactLine?: string | null;
  /** Their saved look, or null for none (BAC-191). */
  look?: AvatarLook | null;
}

/**
 * One person as the Connections tab draws them (FRO-182): their avatar, then their name, bio and
 * contact line at the card's size. The Profile tab's "How others see you" is the same card, filled
 * with the user's own name, bio and look (FRO-184).
 */
export function PersonCard({ name, bio, contactLine = null, look = null }: PersonCardProps) {
  return (
    <div className="flex items-start gap-3">
      <PersonAvatar look={look} className="size-14" />
      <div className="min-w-0 flex-1">
        <PersonLines name={name} bio={bio} contactLine={contactLine} bioSize="lead" />
      </div>
    </div>
  );
}
