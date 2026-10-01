import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useFallbackStations } from "@/features/fallback/use-fallback-stations";
import { createTestProviders } from "@/test/providers";

describe("useFallbackStations", () => {
  it("offers only passport-enabled stations by passport name", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    const { result } = renderHook(() => useFallbackStations(), { wrapper: Providers });

    await waitFor(() => expect(result.current.data?.stations.length).toBeGreaterThan(0));
    const names = result.current.data?.stations.map((station) => station.name) ?? [];
    expect(names).toContain("Careers Corner");
    expect(names).not.toContain("Photo Wall");
    expect(names).not.toContain("Hardware Lab");
  });
});
