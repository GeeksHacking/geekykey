import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useSetStationBooth } from "@/features/stations/use-set-station-booth";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers, queryClient } = createTestProviders(api);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const firstStationId = api.mock.data.stations[0]!.id;
  return {
    api,
    invalidate,
    firstStationId,
    ...renderHook(() => useSetStationBooth(), { wrapper: Providers }),
  };
}

describe("useSetStationBooth", () => {
  it("sends the station's id and booth once, and hands back the station", async () => {
    const { api, firstStationId, result } = setup();
    const setBooth = vi.spyOn(api, "setStationBooth");

    let booth = "";
    await act(async () => {
      booth =
        (await result.current.mutateAsync({ stationId: firstStationId, input: { booth: "C4" } }))
          .station.booth ?? "";
    });

    expect(setBooth).toHaveBeenCalledTimes(1);
    expect(setBooth).toHaveBeenCalledWith(firstStationId, { booth: "C4" });
    expect(booth).toBe("C4");
  });

  it("invalidates the board and the map", async () => {
    // 9.12 changes what the board shows and where the map draws the station, and nothing
    // else reads a booth: /me, the stats and the scan log carry none.
    const { invalidate, firstStationId, result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ stationId: firstStationId, input: { booth: "C4" } });
    });

    const keys = invalidate.mock.calls.map(([argument]) =>
      (argument as { queryKey: readonly string[] }).queryKey.join("/"),
    );
    expect(keys).toEqual(["stationBoard", "map"]);
  });

  it("does not refetch either when the call fails", async () => {
    const { api, invalidate, result } = setup();
    api.mock.failNext("not_found");

    await act(async () => {
      await expect(
        result.current.mutateAsync({ stationId: "no-such-station", input: { booth: "A1" } }),
      ).rejects.toThrow();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
