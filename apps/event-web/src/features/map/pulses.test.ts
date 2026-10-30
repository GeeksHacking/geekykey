import { describe, expect, it } from "vitest";

import { MAX_PULSES_PER_POLL, stationsToPulse } from "@/features/map/pulses";
import { mapStation } from "@/features/map/test-stations";

describe("stationsToPulse", () => {
  const printing = mapStation({ station_id: "printing", taps: 57 });
  const lounge = mapStation({ station_id: "lounge", taps: 12 });

  it("pulses nothing on the first poll", () => {
    expect(stationsToPulse(undefined, [printing, lounge])).toEqual([]);
  });

  it("pulses nothing when no count changed", () => {
    expect(stationsToPulse([printing, lounge], [{ ...printing }, { ...lounge }])).toEqual([]);
  });

  it("pulses each station whose taps went up once per new tap, a cooldown tap included", () => {
    const next = [
      { ...printing, taps: 58 },
      { ...lounge, taps: 14 },
    ];
    expect(stationsToPulse([printing, lounge], next)).toEqual([
      { stationId: "printing", count: 1 },
      { stationId: "lounge", count: 2 },
    ]);
  });

  it("caps the pulses for a burst of taps in one poll", () => {
    expect(stationsToPulse([printing], [{ ...printing, taps: 70 }])).toEqual([
      { stationId: "printing", count: MAX_PULSES_PER_POLL },
    ]);
  });

  it("does not pulse a station whose count went down", () => {
    expect(stationsToPulse([printing], [{ ...printing, taps: 3 }])).toEqual([]);
  });

  it("does not pulse a disabled station, even when a QR fallback tap raises its count", () => {
    expect(stationsToPulse([printing], [{ ...printing, taps: 58, disabled: true }])).toEqual([]);
  });

  it("does not pulse a station that is new since the last poll", () => {
    const added = mapStation({ station_id: "careers", taps: 4 });
    expect(stationsToPulse([printing], [printing, added])).toEqual([]);
  });
});
