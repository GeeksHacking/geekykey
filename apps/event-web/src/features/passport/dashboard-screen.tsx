import { useRef } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { AvatarHero } from "@/features/passport/avatar/avatar-hero";
import { ConnectionList } from "@/features/passport/connection-list";
import { ConnectionRequests } from "@/features/passport/connection-requests";
import { ConnectionReveal } from "@/features/passport/connection-reveal";
import { DisplayNameRow } from "@/features/passport/display-name-row";
import { DashboardTapHelp } from "@/features/passport/dashboard-tap-help";
import { GroupCard } from "@/features/passport/group-card";
import { LatestStampRow } from "@/features/passport/latest-stamp-row";
import { QuestionsPrompt } from "@/features/passport/questions-prompt";
import { ProfileSection } from "@/features/passport/profile-section";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
import { UserIdRow } from "@/features/passport/user-id-row";
import { useMe } from "@/lib/session";

export function DashboardScreen() {
  const { me, refresh } = useMe();
  const scope = useRef<HTMLDivElement>(null);
  const changes = usePassportChanges(scope, me);
  const latest = me.stamps
    .filter((stamp) => stamp.earned_at !== null)
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
    .slice(0, 3);

  return (
    <div ref={scope} className="space-y-10">
      {/* First, because the token page's login link lands on this screen (agreement 8.6). */}
      <ConnectionReveal me={me} />
      <ConnectionRequests requests={me.connection_requests} />
      {/* An organizer sees this screen too, and is kept out of allocation. */}
      {me.user.role === "participant" ? <GroupCard /> : null}
      {/* The grad tea's dashboard leads with the avatar (FRO-105). The showcase's switch PR
          swaps it for the spaceship (FRO-104) or puts the points summary back. */}
      <AvatarHero me={me} changes={changes} />
      {me.user.role === "participant" ? (
        <DisplayNameRow displayName={me.user.display_name} />
      ) : null}
      <UserIdRow userId={me.user.id} />

      {me.recent_taps.length === 0 ? <DashboardTapHelp /> : null}

      {me.user.role === "participant" && me.questions ? (
        <QuestionsPrompt
          key={me.user.id}
          questions={me.questions}
          answers={me.user.answers}
          answersFixed={me.connections.length > 0}
          onAnswersFixed={() => void refresh()}
        />
      ) : null}

      <ProfileSection me={me} />

      <ConnectionList me={me} />

      <section>
        <SectionHeading title="Latest stamps" linkTo="/passport" linkLabel="Open passport" />
        {latest.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {latest.map((stamp) => (
              <LatestStampRow key={stamp.station_id} stamp={stamp} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No stamps yet.</p>
        )}
      </section>

      <section>
        <SectionHeading title="Recent activity" linkTo="/activity" linkLabel="All activity" />
        {me.recent_taps.length > 0 ? (
          <ParticipantTapList taps={me.recent_taps} limit={3} />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet. Your taps will show up here.</p>
        )}
      </section>
    </div>
  );
}
