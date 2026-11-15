import { useEffect, useRef } from "react";

import type { MeResponse } from "@/api/types";
import { answersComplete, startingLook } from "@/features/passport/avatar/starting-look";
import { savedColours } from "@/features/passport/avatar/use-avatar-colours";
import { useUpdateMe } from "@/features/passport/use-update-me";

/**
 * Saves the starting look a participant's answers give, once, when the last answer lands
 * (FRO-109). The service's look and a look this browser saved both win, so a guest who already
 * chose colours keeps them. A failed send waits for the next visit rather than trying on every
 * poll.
 */
export function useStartingLook(me: MeResponse): void {
  const userId = me.user.id;
  const updateMe = useUpdateMe();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (me.user.role !== "participant") return;
    if (me.user.avatar) return;
    if (sent.current === userId) return;
    if (savedColours(userId)) return;
    if (!answersComplete(me.questions, me.user.answers)) return;
    sent.current = userId;
    updateMe.mutate({ avatar: startingLook(me.questions, me.user.answers) });
  }, [userId, me.user.role, me.user.avatar, me.questions, me.user.answers, updateMe]);
}
