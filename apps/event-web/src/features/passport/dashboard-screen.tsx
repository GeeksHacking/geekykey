import { SectionHeading } from "@/components/layout/section-heading";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { DashboardClaimHelp } from "@/features/passport/dashboard-claim-help";
import { LatestStampRow } from "@/features/passport/latest-stamp-row";
import { PointsSummary } from "@/features/passport/points-summary";
import { UserIdRow } from "@/features/passport/user-id-row";
import { useMe } from "@/lib/session";

export function DashboardScreen() {
  const { me } = useMe();
  const latest = me.stamps
    .filter((stamp) => stamp.earned_at !== null)
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
    .slice(0, 3);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <h1 tabIndex={-1} data-page-heading className="text-2xl font-semibold tracking-heading">
          {me.user.display_name ?? "Welcome back"}
        </h1>
        <UserIdRow userId={me.user.id} />
      </div>

      <PointsSummary points={me.points} stamps={me.stamps} />

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
