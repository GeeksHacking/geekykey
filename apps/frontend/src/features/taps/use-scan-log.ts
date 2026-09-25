import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

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
 * from the head's cursor. Both keys include the filters, and the older key
 * also includes the current head cursor, so a new head page starts a fresh
 * history chain instead of skipping the row between the two boundaries.
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
    // The cursor is part of the key: a new head page must start a fresh older
    // chain instead of reusing a boundary that can now skip one row.
    queryKey: queryKeys.tapsOlder(filters, firstCursor),
    queryFn: ({ pageParam }) =>
      api.listTaps({ limit: PAGE_SIZE, before_id: pageParam, ...filters }),
    initialPageParam: firstCursor,
    getNextPageParam: (lastPage) => lastPage.next_before_id ?? undefined,
    enabled: false,
  });

  const headTaps = head.data?.taps;
  const olderPages = older.data?.pages;
  const [olderLoad, setOlderLoad] = useState<{
    filterKey: string;
    headVersion: number | undefined;
    cursor: number;
    loaded: boolean;
  }>();
  const filterKey = JSON.stringify(filters);
  const headVersion = headTaps?.[0]?.id;
  const currentOlderPages =
    olderLoad?.filterKey === filterKey &&
    olderLoad.headVersion === headVersion &&
    olderLoad.cursor === firstCursor &&
    olderLoad.loaded
      ? olderPages
      : undefined;
  const taps = useMemo(
    () => mergeById(headTaps ?? [], currentOlderPages?.flatMap((page) => page.taps) ?? []),
    [headTaps, currentOlderPages],
  );

  const hasMore = currentOlderPages ? older.hasNextPage : firstCursor !== undefined;

  async function loadMore() {
    if (!hasMore || older.isFetching) return;
    // The first older page starts from the head's cursor; later ones follow next_before_id.
    try {
      if (currentOlderPages) {
        await older.fetchNextPage();
      } else {
        const cursor = firstCursor;
        if (cursor === undefined) return;
        setOlderLoad({ filterKey, headVersion, cursor, loaded: false });
        await older.refetch();
        setOlderLoad({ filterKey, headVersion, cursor, loaded: true });
      }
    } catch {
      // The query exposes older.error; the screen renders it instead of leaving an unhandled rejection.
    }
  }

  function retryLoadMore() {
    void loadMore();
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
    retryLoadMore,
    loadMoreError:
      olderLoad?.filterKey === filterKey &&
      olderLoad.headVersion === headVersion &&
      olderLoad.cursor === firstCursor
        ? older.error
        : undefined,
    loadingMore: older.isFetching,
  };
}
