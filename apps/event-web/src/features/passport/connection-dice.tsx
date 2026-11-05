import type { Connection } from "@/api/types";

interface ConnectionDiceProps {
  dice: Connection["dice"];
}

/** The same stored dice in the reveal and the list (agreement 8.1 and 13, BAC-150 approved). */
export function ConnectionDice({ dice }: ConnectionDiceProps) {
  if (!dice) return null;
  const result =
    dice.your_roll === dice.their_roll
      ? "You both win!"
      : dice.result === "win"
        ? "You win!"
        : "They win!";
  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="tabular-nums">
        You rolled {dice.your_roll}. They rolled {dice.their_roll}.
      </p>
      <p className="font-semibold">{result}</p>
    </div>
  );
}
