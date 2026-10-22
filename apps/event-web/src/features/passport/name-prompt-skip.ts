import { useCallback, useState } from "react";

/*
  Skipping the name prompt lasts for the visit (agreement 13): this tab, reloads included.
  The key carries the user ID, so the next person on a shared laptop is still asked.
*/
const keyFor = (userId: string) => `gk-name-prompt-skipped:${userId}`;

function readSkipped(userId: string): boolean {
  try {
    return sessionStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

export function useNamePromptSkip(userId: string): { skipped: boolean; skip: () => void } {
  const [skippedBy, setSkippedBy] = useState<string | null>(() =>
    readSkipped(userId) ? userId : null,
  );
  const skip = useCallback(() => {
    try {
      sessionStorage.setItem(keyFor(userId), "1");
    } catch {
      // Storage can be off in a private window. The prompt still goes for this page.
    }
    setSkippedBy(userId);
  }, [userId]);
  return { skipped: skippedBy === userId, skip };
}
