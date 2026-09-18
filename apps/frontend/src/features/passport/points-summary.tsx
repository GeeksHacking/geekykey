import type { Stamp } from "@/api/types";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PointsSummaryProps {
  points: number;
  stamps: Stamp[];
}

/** The two numbers a participant looks for first. Mono so they line up and read as data. */
export function PointsSummary({ points, stamps }: PointsSummaryProps) {
  const earned = stamps.filter((stamp) => stamp.earned_at !== null).length;
  return (
    <section aria-label="Points and stamps" className="grid gap-6 sm:grid-cols-2 sm:gap-8">
      <div>
        <p className="text-sm text-muted-foreground">Points</p>
        <p className="mt-1 font-mono text-5xl font-semibold tracking-tight">{formatCount(points)}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Stamps</p>
        <p className="mt-1 font-mono text-5xl font-semibold tracking-tight">
          {earned}
          <span className="text-2xl text-muted-foreground"> / {stamps.length}</span>
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Stamp slots">
          {stamps.map((stamp) => (
            <li
              key={stamp.station_id}
              title={stamp.name}
              className={cn("h-2.5 w-6 rounded-sm", stamp.earned_at ? "border border-primary-edge bg-primary" : "bg-muted")}
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
