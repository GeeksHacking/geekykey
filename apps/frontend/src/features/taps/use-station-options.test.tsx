import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useStationOptions } from "@/features/taps/use-station-options";
import { createTestProviders } from "@/test/providers";

describe("useStationOptions", () => {
  it("exposes station query errors for the screen to show", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.failNext("internal_error");
    const { Providers } = createTestProviders(api);
    const { result } = renderHook(() => useStationOptions(), { wrapper: Providers });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.stations).toEqual([]);

    await result.current.refetch();
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.stations.length).toBeGreaterThan(0);
  });
});
