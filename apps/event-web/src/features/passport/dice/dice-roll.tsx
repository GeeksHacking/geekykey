import { useCallback, useEffect, useState, type ComponentType } from "react";

import type { Connection } from "@/api/types";
import { buttonVariants } from "@/components/ui/button";
import { ConnectionDice } from "@/features/passport/connection-dice";
import { markDiceShown } from "@/features/passport/dice/dice-shown";
import type { DiceStageProps } from "@/features/passport/dice/dice-stage";
import { loadDiceStage } from "@/features/passport/dice/load-dice-stage";
import { cn } from "@/lib/utils";

type Phase = "loading" | "ready" | "rolling" | "landed" | "failed";

interface DiceRollProps {
  userId: string;
  connection: Connection;
  /** Whether the dice wait for a tap, from useDiceWaiting when the reveal opened. */
  waiting: boolean;
}

/**
 * The reveal's dice (FRO-133). Two 3D dice wait for a tap, tumble and land on the rolls the
 * service kept, and then the result shows. Without them, the plain numbers from BAC-150 show
 * straight away. The reveal keys this by connection, so a newer connection starts afresh.
 */
export function DiceRoll({ userId, connection, waiting }: DiceRollProps) {
  // Decided once: the dice that land here stay on screen after the store says they've shown.
  const [plays] = useState(waiting);
  const [phase, setPhase] = useState<Phase>("loading");
  const [Stage, setStage] = useState<ComponentType<DiceStageProps> | null>(null);
  // Each /me poll brings a new connection object, so the callbacks key on its time instead.
  const connectedAt = connection.connected_at;

  const fail = useCallback(() => {
    setPhase("failed");
    markDiceShown(userId, connectedAt);
  }, [userId, connectedAt]);

  useEffect(() => {
    if (!plays) return;
    let cancelled = false;
    loadDiceStage().then(
      (module) => {
        if (!cancelled) setStage(() => module.DiceStage);
      },
      () => {
        if (!cancelled) fail();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [plays, fail]);

  const onReady = useCallback(() => setPhase((now) => (now === "loading" ? "ready" : now)), []);
  const onLanded = useCallback(() => {
    setPhase("landed");
    markDiceShown(userId, connectedAt);
  }, [userId, connectedAt]);

  const { dice } = connection;
  if (!dice) return null;
  if (!plays || phase === "failed") return <ConnectionDice dice={dice} />;

  const tapToRoll = phase === "loading" || phase === "ready";
  return (
    <div className="mt-3">
      <div className={cn("relative w-full max-w-xs", tapToRoll && "pb-12")}>
        <div className="h-36">
          {Stage ? (
            <Stage
              dice={dice}
              rolling={phase === "rolling" || phase === "landed"}
              onReady={onReady}
              onLanded={onLanded}
              onFailed={fail}
            />
          ) : null}
        </div>
        <div className="grid grid-cols-2 text-center text-xs text-muted-foreground">
          <span>You</span>
          <span>Them</span>
        </div>
        {tapToRoll ? (
          // It covers the dice too, so tapping them rolls them. Its label sits under them.
          <button
            type="button"
            disabled={phase === "loading"}
            onClick={() => setPhase("rolling")}
            className="group absolute inset-0 flex items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress"
          >
            <span
              className={cn(
                buttonVariants(),
                "pointer-events-none group-active:scale-[0.98] group-disabled:opacity-60",
              )}
            >
              Roll the dice
            </span>
          </button>
        ) : null}
      </div>
      {phase === "landed" ? <ConnectionDice dice={dice} /> : null}
    </div>
  );
}
