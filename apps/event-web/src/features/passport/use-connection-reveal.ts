import { useState } from "react";

import type { Connection, MeResponse } from "@/api/types";

/*
  Comparing two polls would miss the usual case. The token page's button opens these screens
  through a login link, so the first /me already has the new connection. So the phone remembers
  the newest connection dismissed, and anything newer is revealed. localStorage, because the
  login link opens a new tab. The key carries the user ID, for the next person on a shared phone.
*/
const keyFor = (userId: string) => `gk-connection-dismissed:${userId}`;

function readDismissed(userId: string): string | null {
  try {
    return localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export interface ConnectionRevealState {
  /** The newest connection, until it is dismissed. */
  connection: Connection | null;
  dismiss: () => void;
}

export function useConnectionReveal(me: MeResponse): ConnectionRevealState {
  const userId = me.user.id;
  const newest = me.connections[0] ?? null;
  const [dismissed, setDismissed] = useState<{ userId: string; at: string } | null>(null);
  const dismissedAt = dismissed?.userId === userId ? dismissed.at : readDismissed(userId);
  const isNew =
    newest !== null &&
    (dismissedAt === null || Date.parse(newest.connected_at) > Date.parse(dismissedAt));

  return {
    connection: isNew ? newest : null,
    dismiss: () => {
      if (!newest) return;
      try {
        localStorage.setItem(keyFor(userId), newest.connected_at);
      } catch {
        // Storage can be off in a private window. The reveal still goes for this page.
      }
      setDismissed({ userId, at: newest.connected_at });
    },
  };
}
