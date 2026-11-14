import { usePromptSkip } from "@/features/passport/use-prompt-skip";

/*
  Skipping the name prompt lasts for the visit (agreement 13): this tab, reloads included.
  The key carries the user ID, so the next person on a shared laptop is still asked.
*/
const KEY = "gk-name-prompt-skipped";

export function useNamePromptSkip(userId: string): { skipped: boolean; skip: () => void } {
  return usePromptSkip(userId, KEY, "visit");
}
