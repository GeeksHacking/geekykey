import { useRef } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { AvatarHero } from "@/features/passport/avatar/avatar-hero";
import { DisplayNameRow } from "@/features/passport/display-name-row";
import { PersonCard } from "@/features/passport/person-card";
import { ProfileSection } from "@/features/passport/profile-section";
import { QuestionsPrompt } from "@/features/passport/questions-prompt";
import { UserIdRow } from "@/features/passport/user-id-row";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
import { useMe } from "@/lib/session";

/**
 * Everything about the user themselves (FRO-184), which Home had as four blocks near its bottom:
 * the avatar, the name, the bio and contact line, how other people see them, the answers and the
 * user ID. Home keeps the avatar, because that is where a new connection's piece arrives.
 *
 * An organiser sees no name row and no answers, which they have none of today.
 */
export function ProfileScreen() {
  const { me, refresh } = useMe();
  const scope = useRef<HTMLDivElement>(null);
  const changes = usePassportChanges(scope, me);
  return (
    <div ref={scope} className="space-y-8">
      <AvatarHero me={me} changes={changes} />
      {me.user.role === "participant" ? (
        <div className="rounded-lg border bg-card px-3 py-3">
          <DisplayNameRow displayName={me.user.display_name} />
        </div>
      ) : null}
      <ProfileSection me={me} />
      <section>
        <SectionHeading title="How others see you" />
        <div className="rounded-lg border bg-card px-3 py-4">
          <PersonCard name={me.user.display_name ?? "Guest"} bio={me.user.bio} />
        </div>
      </section>
      {me.user.role === "participant" && me.questions ? (
        <QuestionsPrompt
          key={me.user.id}
          questions={me.questions}
          answers={me.user.answers}
          answersFixed={me.connections.length > 0}
          onAnswersFixed={() => void refresh()}
        />
      ) : null}
      <div className="rounded-lg border bg-card px-3 py-3">
        <UserIdRow userId={me.user.id} />
      </div>
    </div>
  );
}
