import { useEffect, useRef } from "react";

import { createDiceWorld, type Dice, type DiceWorld } from "@/features/passport/dice/dice-world";

export interface DiceStageProps {
  dice: Dice;
  /** True from the tap on. The dice tumble once and stay where they land. */
  rolling: boolean;
  /** The dice are drawn and can be tapped. */
  onReady: () => void;
  /** The dice have landed on the rolls, so the result can show. */
  onLanded: () => void;
  /** The browser refused a WebGL context after all, so the plain numbers show instead. */
  onFailed: () => void;
}

/** Loaded only through load-dice-stage.ts, so three.js and GSAP stay in their own files. */
export function DiceStage({ dice, rolling, onReady, onLanded, onFailed }: DiceStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<DiceWorld | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let created: DiceWorld;
    try {
      created = createDiceWorld(host.current);
    } catch {
      onFailed();
      return;
    }
    world.current = created;
    onReady();
    return () => {
      created.dispose();
      world.current = null;
    };
  }, [onReady, onFailed]);

  // Each /me poll brings a new `dice` object with the same rolls. The world rolls only once.
  useEffect(() => {
    if (rolling) world.current?.roll(dice, onLanded);
  }, [rolling, dice, onLanded]);

  return <div ref={host} className="size-full" aria-hidden="true" />;
}
