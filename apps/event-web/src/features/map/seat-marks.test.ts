import { describe, expect, it } from "vitest";

import type { MapStation } from "@/api/types";
import { seatMarks, seatText } from "@/features/map/seat-marks";
import { mapStation } from "@/features/map/test-stations";

const NOW = Date.parse("2026-11-17T08:00:00.000Z");

function station(fields: Partial<MapStation> = {}) {
  return mapStation({ station_id: "s1", ...fields });
}

describe("seatMarks", () => {
  it("marks an open seat with the seconds left", () => {
    const marks = seatMarks(
      undefined,
      [station({ open_seat_until: "2026-11-17T08:00:42.000Z" })],
      NOW,
    );

    expect(marks.get("s1")).toEqual({ state: "open", seconds: 42 });
  });

  it("marks a seat taken before its closing time for one poll", () => {
    const before = [station({ open_seat_until: "2026-11-17T08:01:00.000Z" })];
    const after = [station({ open_seat_until: null })];

    expect(seatMarks(before, after, NOW).get("s1")).toEqual({ state: "taken", seconds: 0 });
    expect(seatMarks(after, after, NOW).get("s1")).toBeUndefined();
  });

  it("clears a seat that closed at its closing time without Taken", () => {
    const before = [station({ open_seat_until: "2026-11-17T07:59:58.000Z" })];
    const after = [station({ open_seat_until: null })];

    expect(seatMarks(before, after, NOW).get("s1")).toBeUndefined();
  });

  it("marks nothing without the field or a previous poll", () => {
    expect(seatMarks(undefined, [station()], NOW).size).toBe(0);
    expect(seatMarks([station()], [station()], NOW).size).toBe(0);
  });

  it("does not take a station that was not on the previous poll as taken", () => {
    const after = [station({ open_seat_until: null })];

    expect(seatMarks([], after, NOW).get("s1")).toBeUndefined();
  });
});

describe("seatText", () => {
  it("says the seat is open with the seconds, or Taken", () => {
    expect(seatText({ state: "open", seconds: 42 })).toBe("Open seat 42s");
    expect(seatText({ state: "open", seconds: 0 })).toBe("Open seat");
    expect(seatText({ state: "taken", seconds: 0 })).toBe("Taken");
  });
});
