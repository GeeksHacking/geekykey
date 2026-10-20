import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useReplaceStationKey } from "@/features/stations/use-replace-station-key";
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
    ...renderHook(() => useReplaceStationKey(), { wrapper: Providers }),
  };
}

describe("useReplaceStationKey", () => {
  it("sends the station's id once and hands back the new key", async () => {
    const { api, firstStationId, result } = setup();
    const replace = vi.spyOn(api, "replaceStationKey");

    let key = "";
    await act(async () => {
      key = (await result.current.mutateAsync(firstStationId)).api_key;
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(firstStationId);
    expect(key).toMatch(/^gk_sta_/);
  });

  it("invalidates the board and nothing else", async () => {
    // The create and the passport calls invalidate the stats and /me as well. A key
    // changes neither, so one refetch is what the change is worth.
    const { invalidate, firstStationId, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(firstStationId);
    });

    // No waiting: mutateAsync resolves only after onSuccess has finished, so the
    // invalidation is already recorded, and a hook that stopped awaiting it would fail here.
    const keys = invalidate.mock.calls.map(([argument]) =>
      (argument as { queryKey: readonly string[] }).queryKey.join("/"),
    );
    expect(keys).toEqual(["stationBoard"]);
  });

  it("does not refetch the board when the call fails", async () => {
    // onSuccess rather than onSettled, so a refused replace does not look like a
    // successful one to the board.
    const { api, invalidate, result } = setup();
    api.mock.failNext("not_found");

    await act(async () => {
      await expect(result.current.mutateAsync("no-such-station")).rejects.toThrow();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
