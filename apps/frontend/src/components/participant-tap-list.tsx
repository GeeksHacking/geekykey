import type { MeTap } from "@/api/types";
import { ParticipantTapRow } from "@/components/participant-tap-row";
import { formatDayLabel } from "@/lib/format";

interface ParticipantTapListProps {
  /** Newest first, as the API returns them. */
  taps: MeTap[];
  limit?: number;
}

interface DayGroup {
  label: string;
  taps: MeTap[];
}

function groupByDay(taps: MeTap[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const tap of taps) {
    const label = formatDayLabel(tap.received_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.taps.push(tap);
    else groups.push({ label, taps: [tap] });
  }
  return groups;
}

export function ParticipantTapList({ taps, limit }: ParticipantTapListProps) {
  const groups = groupByDay(limit ? taps.slice(0, limit) : taps);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{group.label}</h3>
          <ul className="divide-y rounded-lg border">
            {group.taps.map((tap) => (
              <ParticipantTapRow key={tap.id} tap={tap} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
