import { Broadcast } from "@phosphor-icons/react";

import type { Stamp } from "@/api/types";
import { EmptyState } from "@/components/layout/empty-state";
import { StampTile } from "@/features/passport/stamp-tile";

/**
 * Every station gets a slot, in the order the API returns them, so the book stays stable
 * between visits. `stamped` names the slots the last poll filled.
 */
export function StampGrid({ stamps, stamped }: { stamps: Stamp[]; stamped: readonly string[] }) {
  if (stamps.length === 0) {
    return (
      <EmptyState
        icon={Broadcast}
        title="No stations yet"
        description="The organisers have not set up any stations. Check back once the event starts."
      />
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Stamps">
      {stamps.map((stamp) => (
        <StampTile
          key={stamp.station_id}
          stamp={stamp}
          changed={stamped.includes(stamp.station_id)}
        />
      ))}
    </ul>
  );
}
