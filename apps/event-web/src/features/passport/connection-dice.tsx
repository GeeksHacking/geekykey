import type { Connection } from "@/api/types";
import { WinPiece } from "@/features/passport/win-piece";
import { cn } from "@/lib/utils";

interface ConnectionDiceProps {
  dice: Connection["dice"];
  /** stack: the result on its own line, as the reveal's answer. line: one line in a list's row. */
  layout: "stack" | "line";
  className?: string;
  reward?: boolean;
}

/** The same stored dice in the reveal and the list (agreement 8.1 and 13, BAC-150 approved). */
export function ConnectionDice({ dice, layout, className, reward = true }: ConnectionDiceProps) {
  if (!dice) return null;
  const result =
    dice.your_roll === dice.their_roll
      ? "You both win!"
      : dice.result === "win"
        ? "You win!"
        : "They win!";
  return (
    <div
      className={cn(
        "text-sm",
        layout === "line" ? "flex flex-wrap gap-x-2 gap-y-0.5" : "space-y-0.5",
        className,
      )}
    >
      <p className="tabular-nums">
        You rolled {dice.your_roll}. They rolled {dice.their_roll}.
      </p>
      <p className={layout === "line" ? "font-semibold" : "type-item"}>{result}</p>
      {reward ? <WinPiece result={dice.result} layout={layout} /> : null}
    </div>
  );
}
