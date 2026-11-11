import { Button } from "@/components/ui/button";
import { timeLeftLine } from "@/features/passport/reaction/reaction-wording";
import { RoundCountdown } from "@/features/passport/round-countdown";

/** The instructions and the deadline before a reaction test starts (FRO-152). */
export function ReactionIntro({
  target,
  playBy,
  secondsLeft,
  onReady,
}: {
  target: "connection" | "duel";
  playBy: string;
  secondsLeft: number;
  onReady: () => void;
}) {
  return (
    <div className={target === "duel" ? "text-center" : "rounded-lg bg-muted p-3 text-center"}>
      <p className="type-item">Reaction test</p>
      <p className="mt-1 text-sm">
        When the box turns green, tap it as fast as you can. Tap before then and you lose. The
        faster of you wins.
      </p>
      {target === "duel" ? (
        <RoundCountdown closesAt={playBy} duel />
      ) : (
        <p aria-live="off" className="mt-1 font-mono text-sm tabular-nums">
          {timeLeftLine(secondsLeft)}
        </p>
      )}
      <Button type="button" className="mt-3" onClick={onReady}>
        I&apos;m ready
      </Button>
    </div>
  );
}
