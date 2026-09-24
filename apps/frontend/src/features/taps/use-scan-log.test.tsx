import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useScanLog } from "@/features/taps/use-scan-log";
import { createTestProviders } from "@/test/providers";

function setup(filters: Parameters<typeof useScanLog>[0]) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  return { api, ...renderHook(() => useScanLog(filters), { wrapper: Providers }) };
}

describe("useScanLog", () => {
  it("shows the newest page first, then loads the rest without duplicates", async () => {
    const { api, result } = setup({});
    const total = api.mock.data.taps.length;
    expect(total).toBeGreaterThan(50);

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.taps).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.taps[0]!.id).toBeGreaterThan(result.current.taps[1]!.id);

    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.taps).toHaveLength(total));
    expect(new Set(result.current.taps.map((tap) => tap.id)).size).toBe(total);
    expect(result.current.hasMore).toBe(false);
  });

  it("exposes a failed older page and can retry it", async () => {
    const { api, result } = setup({});
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.hasMore).toBe(true);

    api.mock.failNext("internal_error");
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadMoreError).toBeDefined());
    expect(result.current.taps).toHaveLength(50);

    await act(async () => {
      result.current.retryLoadMore();
    });
    await waitFor(() => expect(result.current.loadMoreError).toBeNull());
    expect(result.current.taps.length).toBeGreaterThan(50);
  });

  it("applies the status filter to every page", async () => {
    const { result } = setup({ status: "cooldown" });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.taps.length).toBeGreaterThan(0);
    expect(result.current.taps.every((tap) => tap.status === "cooldown")).toBe(true);
  });
});
