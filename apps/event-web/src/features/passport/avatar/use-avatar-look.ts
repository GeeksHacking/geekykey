import { useEffect, useRef } from "react";

import type { MeResponse } from "@/api/types";
import { lookFrom, sameColours } from "@/features/passport/avatar/avatar-colours";
import { savedColours, useAvatarColours } from "@/features/passport/avatar/use-avatar-colours";
import { useUpdateMe } from "@/features/passport/use-update-me";

/**
 * Keeps this browser's copy of the look in step with the service's (FRO-181, BAC-191). The
 * service's copy is the one that counts, so a poll writes it here, which is how a change made on
 * another phone arrives. Before the service kept one, the look lived only in this browser, so a
 * browser that saved one sends it once when /me gives none. The browser's copy stays for the
 * first paint, before /me arrives.
 */
export function useAvatarLook(me: MeResponse): void {
  const userId = me.user.id;
  const serviceLook = me.user.avatar ?? null;
  const { colours, setColours } = useAvatarColours(userId);
  const updateMe = useUpdateMe();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (serviceLook) {
      const fromService = lookFrom(serviceLook);
      if (!sameColours(fromService, colours)) setColours(fromService);
      return;
    }
    if (sent.current === userId) return;
    const saved = savedColours(userId);
    if (!saved) return;
    // Once per mount: a failed send waits for the next visit rather than trying on every poll.
    sent.current = userId;
    updateMe.mutate({ avatar: saved });
  }, [serviceLook, colours, setColours, userId, updateMe]);
}
