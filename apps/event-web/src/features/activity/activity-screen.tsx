import { HandTap } from "@phosphor-icons/react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { useMe } from "@/lib/session";

export function ActivityScreen() {
  const { me } = useMe();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Your last 50 taps, newest first. Taps that did not count are listed too, with the reason."
      />
      {me.recent_taps.length > 0 ? (
        <ParticipantTapList taps={me.recent_taps} />
      ) : (
        <EmptyState
          icon={HandTap}
          title="No taps yet"
          description="Find a station and hold your token on the tap area. Each tap shows up here within a few seconds."
        />
      )}
    </div>
  );
}
