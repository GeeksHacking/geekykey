import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { useDisableStation } from "@/features/stations/use-disable-station";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers, queryClient } = createTestProviders(api);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  // The fixture board's first row is enabled and carries passport settings, so it has
  // something at stake on disable.
  const enabledStationId = api.mock.data.stations[0]!.id;
  return {
    api,
    invalidate,
    enabledStationId,
    ...renderHook(() => useDisableStation(), { wrapper: Providers }),
  };
}

describe("useDisableStation", () => {
  it("sends the station's id once and hands back the disabled station", async () => {
    const { api, enabledStationId, result } = setup();
    const disable = vi.spyOn(api, "disableStation");

    let disabledAt: string | null = null;
    await act(async () => {
      disabledAt = (await result.current.mutateAsync(enabledStationId)).station.disabled_at;
    });

    expect(disable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledWith(enabledStationId);
    expect(disabledAt).toBeTypeOf("string");
  });

  it("invalidates the board and nothing else", async () => {
    // The create and the passport calls invalidate the stats and /me as well. A disable
    // changes neither, so one refetch is what the change is worth.
    const { invalidate, enabledStationId, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(enabledStationId);
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
    // board's refetch: a dialog that closes on the resolution never races that refetch.
    const { invalidate, enabledStationId, result } = setup();
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
      mutation = result.current.mutateAsync(enabledStationId).finally(() => {
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
    // onSuccess rather than onSettled, so a refused disable does not count as one.
    const { api, invalidate, result } = setup();
    api.mock.failNext("not_found");

    await act(async () => {
      await expect(result.current.mutateAsync("no-such-station")).rejects.toThrow();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
