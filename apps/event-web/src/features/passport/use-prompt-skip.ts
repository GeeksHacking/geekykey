import { useCallback, useState } from "react";

/** Where a prompt's skip lasts: this visit, or this browser (FRO-186). */
export type SkipStore = "visit" | "browser";

function storeFor(kind: SkipStore): Storage {
  return kind === "visit" ? sessionStorage : localStorage;
}

function readSkipped(store: SkipStore, key: string): boolean {
  try {
    return storeFor(store).getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A prompt's skip, remembered per user ID so the next person on a shared laptop is still asked.
 * `visit` lasts for this tab, reloads included; `browser` lasts until this browser's storage is
 * cleared (FRO-186).
 */
export function usePromptSkip(
  userId: string,
  keyPrefix: string,
  store: SkipStore,
): { skipped: boolean; skip: () => void } {
  const key = `${keyPrefix}:${userId}`;
  const [skippedBy, setSkippedBy] = useState<string | null>(() =>
    readSkipped(store, key) ? userId : null,
  );
  const skip = useCallback(() => {
    try {
      storeFor(store).setItem(key, "1");
    } catch {
      // Storage can be off in a private window. The prompt still goes for this page.
    }
    setSkippedBy(userId);
  }, [key, store, userId]);
  return { skipped: skippedBy === userId, skip };
}
