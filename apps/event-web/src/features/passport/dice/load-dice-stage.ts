type DiceStageModule = typeof import("@/features/passport/dice/dice-stage");

let loading: Promise<DiceStageModule> | undefined;

/*
  three.js and GSAP come through import() only, when a reveal has dice waiting for a tap, so the
  dashboard never pays for them otherwise. A failed download shows that connection's numbers and
  is forgotten, so the next new connection tries again.
*/
export function loadDiceStage(): Promise<DiceStageModule> {
  loading ??= import("@/features/passport/dice/dice-stage").catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
