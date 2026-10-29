import type { Stamp } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import type { PassportChanges } from "@/features/passport/passport-changes";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PointsSummaryProps {
  points: number;
  stamps: Stamp[];
  /** What the last poll changed, for the dashboard to animate. */
  changes: PassportChanges;
}

/** The two numbers a participant looks for first. Mono so they line up and read as data. */
export function PointsSummary({ points, stamps, changes }: PointsSummaryProps) {
  const earned = stamps.filter((stamp) => stamp.earned_at !== null).length;
  return (
    <section
      aria-label="Points and stamps"
      className="relative grid gap-6 rounded-lg border bg-card p-5 sm:grid-cols-2 sm:gap-8"
    >
      <CornerBrackets />
      <div>
        <p className="look-label text-muted-foreground">Points</p>
        {/* Keyed by the number, so on a phone each rise plays its animation again. The
            count-up on wider screens writes into this element's text. */}
        <p
          key={points}
          data-changed={changes.points ? "points" : undefined}
          className="mt-1 font-mono text-5xl font-semibold tracking-heading phone-change:animate-in phone-change:fade-in-0 phone-change:slide-in-from-bottom-2 phone-change:duration-200"
        >
          {formatCount(points)}
        </p>
      </div>
      <div>
        <p className="look-label text-muted-foreground">Stamps</p>
        <p className="mt-1 font-mono text-5xl font-semibold tracking-heading">
          {earned}
          <span className="text-2xl text-muted-foreground"> / {stamps.length}</span>
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Stamp slots">
          {stamps.map((stamp) => (
            <li
              key={stamp.station_id}
              title={stamp.name}
              data-changed={changes.stamped.includes(stamp.station_id) ? "slot" : undefined}
              className={cn(
                "h-2.5 w-6 rounded-sm phone-change:animate-in phone-change:fade-in-0 phone-change:zoom-in-50 phone-change:duration-200",
                stamp.earned_at ? "border border-primary-edge bg-primary" : "bg-muted",
              )}
            >
              <span className="sr-only">
                {stamp.name}: {stamp.earned_at ? "stamped" : "not yet"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
