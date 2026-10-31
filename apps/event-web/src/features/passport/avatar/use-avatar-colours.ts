import { useCallback, useSyncExternalStore } from "react";

import { parseColours, type AvatarColours } from "@/features/passport/avatar/avatar-colours";

/*
  The guest's colours live in this browser only (FRO-105), so they need no backend. The key
  carries the user ID, so the next person on a shared phone starts from the base colours.
  The dashboard and the passport's name prompt both show the choice, and a store rather
  than state lets a pick in one show in the other at once.
*/
const keyFor = (userId: string) => `gk-avatar-colours:${userId}`;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(userId: string): string | null {
  try {
    return localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

// One object per saved string, so React sees the same choice until it changes.
let cached: { raw: string | null; colours: AvatarColours } | undefined;

function snapshot(userId: string): AvatarColours {
  const raw = read(userId);
  if (!cached || cached.raw !== raw) cached = { raw, colours: parseColours(raw) };
  return cached.colours;
}

export function useAvatarColours(userId: string) {
  const colours = useSyncExternalStore(subscribe, () => snapshot(userId));
  const setColours = useCallback(
    (next: AvatarColours) => {
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      } catch {
        // Storage can be off in a private window. The choice then lasts until a reload.
        cached = { raw: read(userId), colours: next };
      }
      for (const listener of listeners) listener();
    },
    [userId],
  );
  return { colours, setColours };
}
