import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useFallbackStations } from "@/features/fallback/use-fallback-stations";
import { useStationBoard } from "@/features/stations/use-station-board";
import { useStationOptions } from "@/features/taps/use-station-options";
import { createTestProviders } from "@/test/providers";

describe("station board query cache", () => {
  it("shares the raw board while exposing three different selected views", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    const { result } = renderHook(
      () => ({
        board: useStationBoard(),
        options: useStationOptions(),
        fallback: useFallbackStations(),
      }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.board.data?.stations.length).toBeGreaterThan(0));
    expect(result.current.options.stations.some((station) => station.name === "Reader 3")).toBe(
      true,
    );
    expect(
      result.current.fallback.data?.stations.some((station) => station.name === "Photo Wall"),
    ).toBe(false);
  });
});
