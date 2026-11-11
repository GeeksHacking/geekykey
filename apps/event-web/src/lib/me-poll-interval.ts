import type { MeResponse } from "@/api/types";
import { POLL_ME_MS, POLL_ME_ROUND_MS } from "@/lib/constants";

export function mePollInterval(
  me: MeResponse | null | undefined,
  cardMounted = false,
): number | false {
  if (!me) return false;
  return cardMounted && (me.round?.state === "opening" || me.round?.state === "playing")
    ? POLL_ME_ROUND_MS
    : POLL_ME_MS;
}
