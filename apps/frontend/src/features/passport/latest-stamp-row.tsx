import type { Stamp } from "@/api/types";
import { StationGlyph } from "@/features/passport/station-glyph";
import { formatPoints, formatWhen } from "@/lib/format";

/** Compact row for the dashboard. Only rendered for earned stamps. */
export function LatestStampRow({ stamp }: { stamp: Stamp }) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary-edge bg-primary text-primary-foreground">
        <StationGlyph name={stamp.name} weight="fill" className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{stamp.name}</p>
        {stamp.location ? <p className="text-xs text-muted-foreground">{stamp.location}</p> : null}
      </div>
      <div className="shrink-0 text-right font-mono text-xs text-muted-foreground">
        <p className="text-foreground">{formatPoints(stamp.points)}</p>
        {stamp.earned_at ? <time dateTime={stamp.earned_at}>{formatWhen(stamp.earned_at)}</time> : null}
      </div>
    </li>
  );
}
