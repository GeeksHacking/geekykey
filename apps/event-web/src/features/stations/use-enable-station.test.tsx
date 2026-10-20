import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useEnableStation } from "@/features/stations/use-enable-station";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers, queryClient } = createTestProviders(api);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  // The fixture "Info Desk" row is the one seeded already disabled, so enable has a real
  // flip to answer, not a no-op.
  const disabledStationId = api.mock.data.stations.find(
    (station) => station.disabled_at !== null,
  )!.id;
  return {
    api,
    invalidate,
    disabledStationId,
    ...renderHook(() => useEnableStation(), { wrapper: Providers }),
  };
}

describe("useEnableStation", () => {
  it("sends the station's id once and hands back the enabled station", async () => {
    const { api, disabledStationId, result } = setup();
    const enable = vi.spyOn(api, "enableStation");

    let disabledAt: string | null = "";
    await act(async () => {
      disabledAt = (await result.current.mutateAsync(disabledStationId)).station.disabled_at;
    });

    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith(disabledStationId);
    expect(disabledAt).toBeNull();
  });

  it("invalidates the board and nothing else", async () => {
    // Enabling changes no stats query and no /me query, so one refetch is what the
    // change is worth, and the same is true for the disable call.
    const { invalidate, disabledStationId, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(disabledStationId);
    });

    // The call is recorded the moment onSuccess runs it, and this test only checks
    // what it touched. Whether the mutation waits for it is the next test's business.
    const keys = invalidate.mock.calls.map(([argument]) =>
      (argument as { queryKey: readonly string[] }).queryKey.join("/"),
    );
    expect(keys).toEqual(["stationBoard"]);
  });

  it("does not resolve the mutation until the board's invalidation has run", async () => {
    // onSuccess awaits the invalidate, so a resolved mutation has already ordered the
    // board's refetch: a screen that acts on the resolution never races that refetch.
    const { invalidate, disabledStationId, result } = setup();
    let settled = false;
    let release!: () => void;
    invalidate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    let mutation: Promise<unknown> = Promise.resolve();
    await act(async () => {
      mutation = result.current.mutateAsync(disabledStationId).finally(() => {
        settled = true;
      });
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    // A real macrotask leaves every microtask in the queue plenty of room to run, so the
    // only thing that can keep the mutation from settling here is the pending invalidation.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(settled).toBe(false);

    release();
    await act(async () => {
      await mutation;
    });
    expect(settled).toBe(true);
  });

  it("does not refetch the board when the call fails", async () => {
    // onSuccess rather than onSettled, so a refused enable does not count as one.
    const { api, invalidate, result } = setup();
    api.mock.failNext("not_found");

    await act(async () => {
      await expect(result.current.mutateAsync("no-such-station")).rejects.toThrow();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
