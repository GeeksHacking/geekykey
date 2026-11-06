import type { Reaction } from "@/api/types";
import {
  playedLine,
  resultLine,
  theirLine,
  yourLine,
} from "@/features/passport/reaction/reaction-wording";
import { cn } from "@/lib/utils";

interface ConnectionReactionProps {
  reaction: Reaction | null | undefined;
  /** stack: the reveal's lines, with the user's play before the result. line: a list's row. */
  layout: "stack" | "line";
  className?: string;
}

/** A connection's reaction test once played, in the reveal and the list (agreement 8.1 and 13). */
export function ConnectionReaction({ reaction, layout, className }: ConnectionReactionProps) {
  if (!reaction) return null;
  const lines = cn(
    "text-sm",
    layout === "line" ? "flex flex-wrap gap-x-2 gap-y-0.5" : "space-y-0.5",
    className,
  );
  if (reaction.result === null) {
    if (reaction.your_play !== "not_played") {
      return (
        <div className={lines}>
          <p className="type-item tabular-nums">{playedLine(reaction.your_ms)}</p>
          <p className="text-muted-foreground">Waiting for them to play.</p>
        </div>
      );
    }
    // The user hasn't played. The reveal or the row's own test says how to.
    if (layout === "stack") return null;
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>Reaction test in progress.</p>
    );
  }
  return (
    <div className={lines}>
      <p className="tabular-nums">
        {yourLine(reaction.your_play, reaction.your_ms)}{" "}
        {theirLine(reaction.their_play, reaction.their_ms)}
      </p>
      <p className={layout === "line" ? "font-semibold" : "type-item"}>{resultLine(reaction)}</p>
    </div>
  );
}
