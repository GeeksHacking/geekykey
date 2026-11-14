import { Link } from "@tanstack/react-router";
import { useRef } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { Button } from "@/components/ui/button";
import { AvatarHero } from "@/features/passport/avatar/avatar-hero";
import { ConnectionList } from "@/features/passport/connection-list";
import { ConnectionRequests } from "@/features/passport/connection-requests";
import { ConnectionReveal } from "@/features/passport/connection-reveal";
import { DashboardTapHelp } from "@/features/passport/dashboard-tap-help";
import { GroupCard } from "@/features/passport/group-card";
import { LatestStampRow } from "@/features/passport/latest-stamp-row";
import { PhraseCard } from "@/features/passport/phrase-card";
import { TeamRoundCard } from "@/features/passport/team-round-card";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
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
    <div ref={scope} className="space-y-8">
      <TeamRoundCard key={`round:${me.user.id}`} userId={me.user.id} round={me.round} />
      {/* First, because the token page's login link lands on this screen (agreement 8.6). */}
      <ConnectionReveal me={me} />
      <ConnectionRequests requests={me.connection_requests} />
      {/* An organizer sees this screen too, and is kept out of allocation. */}
      {me.user.role === "participant" ? <GroupCard /> : null}
      {/* Only someone in a group, while a phrase is set, has one to complete (BAC-169). */}
      {me.phrase ? <PhraseCard phrase={me.phrase} /> : null}
      {/* The dashboard leads with the avatar (FRO-105). It stays here because a new connection's
          piece arrives on this screen, while the rest of the profile moved to its own tab
          (FRO-184). */}
      <AvatarHero me={me} changes={changes} />

      {me.recent_taps.length === 0 ? (
        <DashboardTapHelp answersGame={me.questions !== null} />
      ) : null}

      {/* What happened at the event, then what's set up for it, which is rarely what someone
          opened the screen for. */}
      <ConnectionList me={me} />

      <section>
        <SectionHeading title="Latest stamps" />
        {latest.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {latest.map((stamp) => (
              <LatestStampRow key={stamp.station_id} stamp={stamp} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No stamps yet.</p>
        )}
      </section>

      <section>
        <SectionHeading title="Recent activity" />
        {me.recent_taps.length > 0 ? (
          <ParticipantTapList taps={me.recent_taps} limit={3} />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet. Your taps will show up here.</p>
        )}
        {/* Activity left the tab bar for the Profile tab, so Home is how its screen is reached
            (FRO-184). */}
        <div className="mt-2 flex justify-end">
          <Button asChild variant="link" size="sm">
            <Link to="/activity">See all</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
