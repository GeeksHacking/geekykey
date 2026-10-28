import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";

interface QueryClientOptions {
  /** Tests turn retries off so a deliberate failure surfaces immediately. */
  retry?: boolean;
  /**
   * Milliseconds before each retry. TanStack's own default backs off from a second, which
   * a test waiting on the retry cannot outlast, so a test that exercises retrying asks
   * for zero.
   */
  retryDelay?: number;
}

/**
 * One place for the cache policy, matching apps/event-web. An ApiError is a definite
 * answer from the service, so it is never retried; only network failures get another go.
 */
export function createQueryClient({ retry = true, retryDelay }: QueryClientOptions = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: retry ? (failureCount, error) => !isApiError(error) && failureCount < 2 : false,
        ...(retryDelay === undefined ? {} : { retryDelay }),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
