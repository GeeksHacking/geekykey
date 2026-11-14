import type { MeResponse } from "@/api/types";
import { POLL_ME_FAST_MS, POLL_ME_MS } from "@/lib/constants";

export function mePollInterval(
  me: MeResponse | null | undefined,
  roundCardMounted = false,
  seatCardMounted = false,
): number | false {
  if (!me) return false;
  const roundLive =
    roundCardMounted && (me.round?.state === "opening" || me.round?.state === "playing");
  const seatLive =
    seatCardMounted && me.open_seat?.status === "open" && me.open_seat.role === "sitter";
  return roundLive || seatLive ? POLL_ME_FAST_MS : POLL_ME_MS;
}
