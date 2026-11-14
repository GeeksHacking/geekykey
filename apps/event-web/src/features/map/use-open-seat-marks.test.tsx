import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapStation } from "@/api/types";
import { mapStation } from "@/features/map/test-stations";
import { useOpenSeatMarks } from "@/features/map/use-open-seat-marks";

function station(fields: Partial<MapStation> = {}) {
  return mapStation({ station_id: "s1", ...fields });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useOpenSeatMarks", () => {
  it("keeps the previous poll so a seat taken before its time shows for one poll", () => {
    const open = [station({ open_seat_until: "2026-11-17T08:01:00.000Z" })];
    const { result, rerender } = renderHook(
      ({ stations, polledAt }: { stations: MapStation[]; polledAt: number }) =>
        useOpenSeatMarks(stations, polledAt),
      { initialProps: { stations: open, polledAt: 1 } },
    );
    expect(result.current.get("s1")?.state).toBe("open");

    rerender({ stations: [station({ open_seat_until: null })], polledAt: 2 });
    expect(result.current.get("s1")?.state).toBe("taken");

    rerender({ stations: [station({ open_seat_until: null })], polledAt: 3 });
    expect(result.current.get("s1")).toBeUndefined();
  });

  it("ticks the seconds down without a new poll", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T08:00:00.000Z"));
    const open = [station({ open_seat_until: "2026-11-17T08:00:05.000Z" })];
    const { result } = renderHook(() => useOpenSeatMarks(open, 1));

    expect(result.current.get("s1")?.seconds).toBe(5);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.get("s1")?.seconds).toBe(3);
  });
});
