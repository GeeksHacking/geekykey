import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createMockClient } from "@/api/mock/client";
import { queryKeys } from "@/api/keys";
import { useSetStationGame } from "@/features/stations/use-set-station-game";
import { createTestProviders } from "@/test/providers";

it("sets the game and refreshes the affected caches after cancelling the board poll", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  api.mock.setSession("dev-organizer-1");
  const { station } = await api.createStation({ label: "Duels" });
  const { Providers, queryClient } = createTestProviders(api);
  const cancel = vi.spyOn(queryClient, "cancelQueries");
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const set = vi.spyOn(api, "setStationGame");
  const { result } = renderHook(() => useSetStationGame(station.id), { wrapper: Providers });
  await act(async () => {
    await result.current.mutateAsync("team_duels");
  });
  expect(set).toHaveBeenCalledWith(station.id, "team_duels");
  expect(cancel).toHaveBeenCalledWith({ queryKey: queryKeys.stationBoard });
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
    queryKeys.stationBoard,
    queryKeys.me,
    queryKeys.map,
  ]);
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]!);
  invalidate.mockClear();
  api.mock.failNext("internal_error");
  await act(async () => {
    await expect(result.current.mutateAsync("none")).rejects.toMatchObject({
      code: "internal_error",
    });
  });
  expect(invalidate).not.toHaveBeenCalled();
});
