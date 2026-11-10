interface WinPieceProps {
  result: "win" | "loss" | null;
  /** stack: the reveal's answer. line: a list's row, which stays compact. */
  layout: "stack" | "line";
}

/** The reveal's sentence for a win, which gave the avatar an extra piece (FRO-134). */
export function WinPiece({ result, layout }: WinPieceProps) {
  if (result !== "win" || layout !== "stack") return null;
  return <p className="text-muted-foreground">Winning adds an extra piece to your avatar.</p>;
}
