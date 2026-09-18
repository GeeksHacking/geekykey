import { SealCheck } from "@phosphor-icons/react";

import type { Stamp } from "@/api/types";
import { StationGlyph } from "@/features/passport/station-glyph";
import { formatPoints, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One passport slot. Filled and tinted once earned, dashed outline until then. */
export function StampTile({ stamp }: { stamp: Stamp }) {
  const earned = stamp.earned_at !== null;
  return (
    <li
      className={cn(
        "flex min-h-[9.5rem] flex-col rounded-lg border p-4",
        earned ? "border-primary-text/40 bg-primary/15 dark:bg-primary/10" : "border-dashed text-muted-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-md",
            earned ? "border border-primary-edge bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <StationGlyph name={stamp.name} weight={earned ? "fill" : "regular"} className="h-5 w-5" aria-hidden />
        </span>
        <span className="font-mono text-xs">{formatPoints(stamp.points)}</span>
      </div>
      <p className={cn("mt-4 font-medium leading-snug", earned && "text-foreground")}>{stamp.name}</p>
      {stamp.location ? <p className="text-xs text-muted-foreground">{stamp.location}</p> : null}
      <div className={cn("mt-auto pt-3 text-xs", earned ? "text-primary-text" : "text-muted-foreground")}>
        {stamp.earned_at ? (
          <>
            <p className="inline-flex items-center gap-1 font-medium">
              <SealCheck weight="fill" className="h-3.5 w-3.5" aria-hidden />
              Stamped
            </p>
            <time dateTime={stamp.earned_at} className="block font-mono text-muted-foreground">
              {formatWhen(stamp.earned_at)}
            </time>
          </>
        ) : (
          <p>Not stamped yet</p>
        )}
      </div>
    </li>
  );
}
