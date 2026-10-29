import { describe, expect, it } from "vitest";

import { MPH_EXAMPLE_PLAN } from "@/features/map/floor-plan";
import { placeStations } from "@/features/map/place-stations";
import { mapStation } from "@/features/map/test-stations";

describe("placeStations", () => {
  it("puts a station at its booth's spot", () => {
    const { placed, unplaced } = placeStations(
      [mapStation({ station_id: "printing", booth: "B1" })],
      MPH_EXAMPLE_PLAN,
    );
    expect(placed).toEqual([
      expect.objectContaining({ booth: expect.objectContaining({ name: "B1" }), x: 254, y: 106 }),
    ]);
    expect(unplaced).toEqual([]);
  });

  it("matches a booth whatever its case and spacing", () => {
    const { placed } = placeStations(
      [mapStation({ station_id: "printing", booth: " b1 " })],
      MPH_EXAMPLE_PLAN,
    );
    expect(placed.map((item) => item.booth.name)).toEqual(["B1"]);
  });

  it("lists a station with no booth, or a booth the plan doesn't name, beside the map", () => {
    const none = mapStation({ station_id: "none", booth: null });
    const unknown = mapStation({ station_id: "unknown", booth: "D2" });
    const { placed, unplaced } = placeStations([none, unknown], MPH_EXAMPLE_PLAN);
    expect(placed).toEqual([]);
    expect(unplaced).toEqual([none, unknown]);
  });

  it("sets stations that share a booth side by side, centred on it", () => {
    const { placed } = placeStations(
      [
        mapStation({ station_id: "first", booth: "C5" }),
        mapStation({ station_id: "second", booth: "C5" }),
      ],
      MPH_EXAMPLE_PLAN,
    );
    expect(placed.map(({ x, y }) => [x, y])).toEqual([
      [297, 887],
      [337, 887],
    ]);
  });
});
