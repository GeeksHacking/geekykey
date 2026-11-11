import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { isApiErrorCode } from "@/api/errors";
import type { Reaction, ReactionPlayRequest } from "@/api/types";
import { Button } from "@/components/ui/button";
import { ConnectionReaction } from "@/features/passport/connection-reaction";
import { playedLine } from "@/features/passport/reaction/reaction-wording";
import { usePlayReaction } from "@/features/passport/reaction/use-play-reaction";
import { RoundCountdown } from "@/features/passport/round-countdown";
import { cn } from "@/lib/utils";

/** The random wait before green: 1.5 to 4 seconds, so nobody can tap on a rhythm. */
const WAIT_MIN_MS = 1_500;
const WAIT_SPREAD_MS = 2_500;
/** The longest time the service takes (8.11). */
const LONGEST_MS = 120_000;

type Phase = "intro" | "waiting" | "signal" | "tapped";

/** What 8.11 answers for a play it won't keep. */
const REFUSALS = ["already_played", "too_late", "not_found"] as const;

interface ReactionTestProps {
  connectionId: string;
  target?: "connection" | "duel";
  reaction: Reaction;
}

/**
 * The reveal's reaction test (BAC-156). It says how to play first, and nothing is timed until
 * I'm ready is pressed. Then the box waits a random time, turns green, and the tap sends the time
 * from green to the tap. This phone's clock measures it, which the agreement accepts.
 */
export function ReactionTest({ connectionId, reaction, target = "connection" }: ReactionTestProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const signalAt = useRef(0);
  // A second tap can land before the render that hides the box, so only the first one sends.
  const tapped = useRef(false);
  const play = usePlayReaction(connectionId, target);

  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = setTimeout(
      () => setPhase("signal"),
      WAIT_MIN_MS + Math.random() * WAIT_SPREAD_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  // Before the green is painted, so the time can't include this render. It may include up to a
  // frame of painting, the same on both phones.
  useLayoutEffect(() => {
    if (phase === "signal") signalAt.current = performance.now();
  }, [phase]);

  const send = (request: ReactionPlayRequest) => {
    if (tapped.current) return;
    tapped.current = true;
    setPhase("tapped");
    play.mutate(request);
  };
  const tap = () => {
    if (phase === "waiting") send({ early: true });
    if (phase === "signal") {
      const ms = Math.round(performance.now() - signalAt.current);
      send({ ms: Math.min(Math.max(ms, 1), LONGEST_MS) });
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    tap();
  };

  // What the service has kept wins. A play's answer goes into /me, so it shows here too.
  if (reaction.your_play !== "not_played" || reaction.result !== null) {
    return (
      <>
        {target === "duel" && reaction.result === null ? (
          <RoundCountdown closesAt={reaction.play_by} duel />
        ) : null}
        <ConnectionReaction
          reaction={reaction}
          layout="stack"
          reward={target !== "duel"}
          className="text-center"
        />
      </>
    );
  }

  if (phase === "intro") {
    return (
      <div className={target === "duel" ? "text-center" : "rounded-lg bg-muted p-3 text-center"}>
        <p className="type-item">Reaction test</p>
        <p className="mt-1 text-sm">
          When the box turns green, tap it as fast as you can. Tap before then and you lose. The
          faster of you wins.
        </p>
        {target === "duel" ? (
          <RoundCountdown closesAt={reaction.play_by} duel />
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">You have 2 minutes to play.</p>
        )}
        <Button type="button" className="mt-3" onClick={() => setPhase("waiting")}>
          I&apos;m ready
        </Button>
      </div>
    );
  }

  const sent = play.variables;
  if (phase === "tapped" && sent) {
    // A refused play reads /me again, which shows what the service kept in a moment. Sending it
    // again would only be refused again.
    if (REFUSALS.some((code) => isApiErrorCode(play.error, code))) return null;
    const failed = play.isError;
    return (
      <div className="space-y-0.5 text-center text-sm">
        <p className="type-item tabular-nums">{playedLine("ms" in sent ? sent.ms : null)}</p>
        {failed ? (
          <>
            <p role="alert">Couldn&apos;t send your result. Try again.</p>
            <Button type="button" className="mt-2" onClick={() => play.mutate(sent)}>
              Send again
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">Waiting for them to play.</p>
            {target === "duel" ? <RoundCountdown closesAt={reaction.play_by} duel /> : null}
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      // Focused when it appears, so a keyboard taps with Enter or Space.
      autoFocus
      onPointerDown={tap}
      onKeyDown={onKeyDown}
      className={cn(
        "grid h-36 w-full touch-manipulation select-none place-items-center rounded-lg text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
        phase === "signal"
          ? "bg-status-accepted text-background"
          : "bg-muted text-muted-foreground",
      )}
    >
      {phase === "signal" ? "Tap!" : "Wait for green…"}
    </button>
  );
}
