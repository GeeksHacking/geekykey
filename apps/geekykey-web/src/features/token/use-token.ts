import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { queryKeys } from "@/api/keys";
import type { TokenLookup } from "@/api/types";
import { NetworkError } from "@/api/errors";
import { normalizeUid } from "@/lib/token-uid";

/**
 * GET /api/v1/tokens/{uid} (agreement 8.5). Only called once someone is signed in: the
 * page's session gate keeps anonymous visitors from mounting this.
 *
 * The key is the normalised UID, so the two spellings of one token share a cache entry
 * and one another's answer, rather than refetching for each arrival.
 */
export function useToken(rawUid: string) {
  const api = useApi();
  const uid = normalizeUid(rawUid);
  return useQuery({
    queryKey: queryKeys.token(uid),
    queryFn: (): Promise<TokenLookup> => api.getToken(uid),
    // Only a transport failure is worth another try. An ApiError is the service
    // answering: retrying a validation_failed or rate_limited just repeats it.
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 2,
  });
}
