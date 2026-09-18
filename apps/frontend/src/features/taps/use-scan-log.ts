import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/api/context";
import { describeError } from "@/api/errors";
import type { AdminTap, TapStatus } from "@/api/types";
import { POLL_TAPS_MS } from "@/lib/constants";
import { useRequest } from "@/lib/use-request";

export interface ScanLogFilters {
  station_id?: string;
  status?: TapStatus;
}

interface OlderPages {
  key: string;
  taps: AdminTap[];
  nextBeforeId: number | null;
}

const PAGE_SIZE = 50;

/** Newest first, no duplicates: the polled head and the loaded-older pages can overlap after a poll. */
function mergeById(head: AdminTap[], older: AdminTap[]): AdminTap[] {
  const byId = new Map<number, AdminTap>();
  for (const tap of [...head, ...older]) byId.set(tap.id, tap);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/**
 * The agreement's live-feed recipe: poll the newest page with no cursor and
 * merge by id; page older history with before_id. Changing a filter drops the
 * older pages, since they belong to the previous query.
 */
export function useScanLog(filters: ScanLogFilters) {
  const api = useApi();
  const key = JSON.stringify(filters);
  const head = useRequest(() => api.listTaps({ limit: PAGE_SIZE, ...filters }), {
    key,
    pollMs: POLL_TAPS_MS,
  });
  const [older, setOlder] = useState<OlderPages>({ key, taps: [], nextBeforeId: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const olderForKey = older.key === key ? older : null;
  const headTaps = head.data?.taps;
  const taps = useMemo(
    () => mergeById(headTaps ?? [], olderForKey?.taps ?? []),
    [headTaps, olderForKey],
  );
  const cursor = olderForKey ? olderForKey.nextBeforeId : (head.data?.next_before_id ?? null);

  async function loadMore() {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.listTaps({ limit: PAGE_SIZE, before_id: cursor, ...filters });
      setOlder((prev) => ({
        key,
        taps: [...(prev.key === key ? prev.taps : []), ...page.taps],
        nextBeforeId: page.next_before_id,
      }));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    status: head.status,
    error: head.error,
    refreshing: head.refreshing,
    updatedAt: head.updatedAt,
    refetch: head.refetch,
    taps,
    hasMore: cursor !== null,
    loadMore,
    loadingMore,
  };
}
