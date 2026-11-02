import { useRef } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { AvatarHero } from "@/features/passport/avatar/avatar-hero";
import { DashboardClaimHelp } from "@/features/passport/dashboard-claim-help";
import { LatestStampRow } from "@/features/passport/latest-stamp-row";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
import { UserIdRow } from "@/features/passport/user-id-row";
import { useMe } from "@/lib/session";

export function DashboardScreen() {
  const { me } = useMe();
  const scope = useRef<HTMLDivElement>(null);
  const changes = usePassportChanges(scope, me);
  const latest = me.stamps
    .filter((stamp) => stamp.earned_at !== null)
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
    .slice(0, 3);

  return (
    <div ref={scope} className="space-y-10">
      {/* The grad tea's dashboard leads with the avatar (FRO-105). The showcase's switch PR
          swaps it for the spaceship (FRO-104) or puts the points summary back. */}
      <AvatarHero me={me} changes={changes} />
      <UserIdRow userId={me.user.id} />

      {me.recent_taps.length === 0 ? <DashboardClaimHelp /> : null}

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
