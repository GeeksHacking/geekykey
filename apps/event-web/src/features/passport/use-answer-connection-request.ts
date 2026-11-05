import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";

/**
 * A press on Accept or Decline (BAC-149). Each reads /me again however it went, and stays pending
 * until that answer is back, so the buttons stay off until the request has gone. A failure that
 * leaves the request waiting also leaves it on the screen.
 */
function useAnswerRefetchingMe<T>(answer: (requestId: string) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: answer,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useAcceptConnectionRequest() {
  const api = useApi();
  return useAnswerRefetchingMe((requestId) => api.acceptConnectionRequest(requestId));
}

export function useDeclineConnectionRequest() {
  const api = useApi();
  return useAnswerRefetchingMe((requestId) => api.declineConnectionRequest(requestId));
}
