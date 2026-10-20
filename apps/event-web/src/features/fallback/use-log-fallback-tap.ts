import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { FallbackTapRequest } from "@/api/types";

/** POST /admin/taps. A fallback tap shows up in the scan log and the totals, so both refetch. */
export function useLogFallbackTap() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FallbackTapRequest) => api.createFallbackTap(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["taps"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}
