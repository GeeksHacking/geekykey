import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApi } from "@/api/context";
import { queryKeys, type TapsFilters } from "@/api/keys";
import type { AdminTap } from "@/api/types";
import { POLL_TAPS_MS } from "@/lib/constants";

export type ScanLogFilters = TapsFilters;

const PAGE_SIZE = 50;

/** Newest first, no duplicates: the polled head and the older pages can overlap after a poll. */
function mergeById(head: AdminTap[], older: AdminTap[]): AdminTap[] {
  const byId = new Map<number, AdminTap>();
  for (const tap of [...head, ...older]) byId.set(tap.id, tap);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/**
 * The agreement's live-feed recipe in two queries. The head is the newest page
 * with no cursor, polled every 5 s and merged by id. Older history is an
 * infinite query that only fetches when the organiser asks for more, starting
 * from the head's cursor. Both keys include the filters, so changing a filter
 * starts both over.
 */
export function useScanLog(filters: ScanLogFilters) {
  const api = useApi();

  const head = useQuery({
    queryKey: queryKeys.taps(filters),
    queryFn: () => api.listTaps({ limit: PAGE_SIZE, ...filters }),
    refetchInterval: POLL_TAPS_MS,
  });

  const firstCursor = head.data?.next_before_id ?? undefined;

  const older = useInfiniteQuery({
    queryKey: queryKeys.tapsOlder(filters),
    queryFn: ({ pageParam }) => api.listTaps({ limit: PAGE_SIZE, before_id: pageParam, ...filters }),
    initialPageParam: firstCursor,
    getNextPageParam: (lastPage) => lastPage.next_before_id ?? undefined,
    enabled: false,
  });

  const headTaps = head.data?.taps;
  const olderPages = older.data?.pages;
  const taps = useMemo(
    () => mergeById(headTaps ?? [], olderPages?.flatMap((page) => page.taps) ?? []),
    [headTaps, olderPages],
  );

  const hasMore = olderPages ? older.hasNextPage : firstCursor !== undefined;

  async function loadMore() {
    if (!hasMore || older.isFetching) return;
    // The first older page starts from the head's cursor; later ones follow next_before_id.
    if (olderPages) await older.fetchNextPage();
    else await older.refetch();
  }

  return {
    isPending: head.isPending,
    isError: head.isError,
    error: head.error,
    isFetching: head.isFetching,
    dataUpdatedAt: head.dataUpdatedAt,
    refetch: head.refetch,
    taps,
    hasMore,
    loadMore,
    loadingMore: older.isFetching,
  };
}
