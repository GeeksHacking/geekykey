import { SealCheck } from "@phosphor-icons/react";

import type { Stamp } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { StationGlyph } from "@/features/passport/station-glyph";
import { formatPoints, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One passport slot. Filled, tinted and bracketed once earned, dashed outline until then.
 * `changed` marks a slot the last poll filled, for the passport to animate.
 */
export function StampTile({ stamp, changed = false }: { stamp: Stamp; changed?: boolean }) {
  const earned = stamp.earned_at !== null;
  return (
    <li
      data-changed={changed ? "stamp" : undefined}
      className={cn(
        "relative flex min-h-[9.5rem] flex-col rounded-lg border p-4",
        "phone-change:animate-in phone-change:fade-in-0 phone-change:zoom-in-95 phone-change:duration-200",
        earned
          ? "border-primary-text/40 bg-primary/15 dark:bg-primary/10"
          : "border-dashed text-muted-foreground",
      )}
    >
      {earned ? <CornerBrackets /> : null}
      <div className="flex items-start justify-between gap-2">
        <span
          data-stamp-seal
          className={cn(
            "grid h-10 w-10 place-items-center rounded-md",
            earned
              ? "border border-primary-edge bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          <StationGlyph
            name={stamp.name}
            weight={earned ? "fill" : "regular"}
            className="h-5 w-5"
            aria-hidden
          />
        </span>
        <span className="font-mono text-xs">{formatPoints(stamp.points)}</span>
      </div>
      <p className={cn("mt-4 font-medium leading-snug", earned && "text-foreground")}>
        {stamp.name}
      </p>
      {stamp.location ? <p className="text-xs text-muted-foreground">{stamp.location}</p> : null}
      <div
        data-stamp-note
        className={cn(
          "mt-auto pt-3 text-xs",
          earned ? "text-primary-text" : "text-muted-foreground",
        )}
      >
        {stamp.earned_at ? (
          <>
            <p className="look-label inline-flex items-center gap-1 font-medium">
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
