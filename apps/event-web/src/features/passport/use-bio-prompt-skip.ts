import { usePromptSkip } from "@/features/passport/use-prompt-skip";

/*
  Skipping the bio step lasts in this browser (FRO-186), so a visitor who skips is not asked
  again on their next visit. The key carries the user ID, so the next person on a shared
  laptop is still asked.
*/
const KEY = "gk-bio-prompt-skipped";

export function useBioPromptSkip(userId: string): { skipped: boolean; skip: () => void } {
  return usePromptSkip(userId, KEY, "browser");
}
