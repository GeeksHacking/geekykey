import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";

interface QueryClientOptions {
  /** Tests turn retries off so a deliberate failure surfaces immediately. */
  retry?: boolean;
}

/**
 * One place for the cache policy, matching apps/frontend. An ApiError is a definite
 * answer from the service, so it is never retried; only network failures get another go.
 */
export function createQueryClient({ retry = true }: QueryClientOptions = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: retry ? (failureCount, error) => !isApiError(error) && failureCount < 2 : false,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
