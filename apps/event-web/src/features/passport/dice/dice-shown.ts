import { useCallback, useSyncExternalStore } from "react";

import type { Connection, MeResponse } from "@/api/types";
import { hasWebGL } from "@/features/passport/avatar/webgl";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";

/*
  The dice roll once per connection, on a tap (FRO-133). The phone remembers the newest
  connection whose roll it has shown, the way use-connection-reveal.ts remembers the newest one
  dismissed, so a later visit shows the result without the roll. A store rather than state, so
  the list of connections hears the moment the reveal's dice land.
*/
const keyFor = (userId: string) => `gk-dice-shown:${userId}`;
const listeners = new Set<() => void>();
// Only for a phone whose storage is off, as in a private window, so the roll still counts there.
const unsaved = new Map<string, string>();

function readShown(userId: string): string | null {
  try {
    return localStorage.getItem(keyFor(userId)) ?? unsaved.get(userId) ?? null;
  } catch {
    return unsaved.get(userId) ?? null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Records that this phone has shown the roll of the connection made at `connectedAt`. */
export function markDiceShown(userId: string, connectedAt: string) {
  const shown = readShown(userId);
  if (shown !== null && Date.parse(shown) >= Date.parse(connectedAt)) return;
  try {
    localStorage.setItem(keyFor(userId), connectedAt);
  } catch {
    unsaved.set(userId, connectedAt);
  }
  for (const listener of listeners) listener();
}

/**
 * Whether this phone can play the roll: it has WebGL and hasn't asked for reduced motion. If
 * not, the plain numbers show straight away and the dice never download.
 */
export function canRollDice(): boolean {
  return hasWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The connection whose dice wait for a tap: the one in the reveal, if it has dice this phone
 * can roll and hasn't shown yet. The list holds that connection's result back until then.
 */
export function useDiceWaiting(me: MeResponse): Connection | null {
  const userId = me.user.id;
  const { connection } = useConnectionReveal(me);
  const shown = useSyncExternalStore(
    subscribe,
    useCallback(() => readShown(userId), [userId]),
  );
  if (!connection?.dice || !canRollDice()) return null;
  if (shown !== null && Date.parse(connection.connected_at) <= Date.parse(shown)) return null;
  return connection;
}
