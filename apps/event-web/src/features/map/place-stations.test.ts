import { describe, expect, it } from "vitest";

import { BOOTH_PLAN } from "@/features/map/floor-plan";
import { placeStations } from "@/features/map/place-stations";
import { markerWidth } from "@/features/map/marker-size";
import type { SeatMark } from "@/features/map/seat-marks";
import { mapStation } from "@/features/map/test-stations";

describe("placeStations", () => {
  it("puts a station at its booth's spot", () => {
    const { placed, unplaced } = placeStations(
      [mapStation({ station_id: "printing", booth: "Booth 1" })],
      BOOTH_PLAN,
    );
    expect(placed).toEqual([
      expect.objectContaining({
        booth: expect.objectContaining({ name: "Booth 1" }),
        x: 140,
        y: 120,
      }),
    ]);
    expect(unplaced).toEqual([]);
  });

  it("matches a booth whatever its case and spacing", () => {
    const { placed } = placeStations(
      [mapStation({ station_id: "printing", booth: " booth 1 " })],
      BOOTH_PLAN,
    );
    expect(placed.map((item) => item.booth.name)).toEqual(["Booth 1"]);
  });

  it("keeps shortened booth names unplaced", () => {
    const stations = [
      mapStation({ station_id: "short", booth: "Booth1" }),
      mapStation({ station_id: "number", booth: "1" }),
    ];
    expect(placeStations(stations, BOOTH_PLAN).unplaced).toEqual(stations);
  });

  it("lists a station with no booth, or a booth the plan doesn't name, beside the map", () => {
    const none = mapStation({ station_id: "none", booth: null });
    const unknown = mapStation({ station_id: "unknown", booth: "D2" });
    const { placed, unplaced } = placeStations([none, unknown], BOOTH_PLAN);
    expect(placed).toEqual([]);
    expect(unplaced).toEqual([none, unknown]);
  });

  it("sets stations that share a booth side by side, centred on it", () => {
    const { placed } = placeStations(
      [
        mapStation({ station_id: "first", booth: "Booth 2" }),
        mapStation({ station_id: "second", booth: "Booth 2" }),
      ],
      BOOTH_PLAN,
    );
    expect(placed.map(({ x, y }) => [x, y])).toEqual([
      [417.5, 120],
      [502.5, 120],
    ]);
  });

  it("keeps the markers at a shared booth from overlapping, a disabled one's wider pill too", () => {
    const stations = [
      mapStation({ station_id: "busy", booth: "Booth 2", unique_participants: 1204 }),
      mapStation({ station_id: "off", booth: "Booth 2", disabled: true }),
      mapStation({ station_id: "quiet", booth: "Booth 2" }),
    ];
    const { placed } = placeStations(stations, BOOTH_PLAN);
    for (let index = 1; index < placed.length; index++) {
      const left = placed[index - 1];
      const right = placed[index];
      if (!left || !right) throw new Error("missing marker");
      if (left.y !== right.y) continue;
      const room = (markerWidth(left.station) + markerWidth(right.station)) / 2;
      expect(right.x - left.x).toBeGreaterThanOrEqual(room);
    }
  });

  it("spaces a shared booth by the open seat label while it is shown", () => {
    const open = mapStation({
      station_id: "open",
      booth: "Booth 2",
      open_seat_until: "2026-11-17T08:01:00.000Z",
    });
    const quiet = mapStation({ station_id: "quiet", booth: "Booth 2" });
    const marks = new Map<string, SeatMark>([["open", { state: "open", seconds: 42 }]]);
    const { placed } = placeStations([open, quiet], BOOTH_PLAN, marks);
    const [left, right] = placed;
    if (!left || !right) throw new Error("missing marker");

    const room =
      (markerWidth(left.station, marks.get(left.station.station_id)) +
        markerWidth(right.station, marks.get(right.station.station_id))) /
      2;
    expect(right.x - left.x).toBeGreaterThanOrEqual(room);
    expect(markerWidth(open, marks.get("open"))).toBeGreaterThan(markerWidth(open));
  });
});

it("reserves the waiting square even without a seat or a wide count", () => {
  expect(markerWidth(mapStation({ station_id: "relay", game: "relay" }))).toBeGreaterThanOrEqual(
    77,
  );
});

it("wraps shared markers inside the table without overlapping pills or waiting squares", () => {
  const stations = [
    mapStation({ station_id: "first", booth: "Booth 2" }),
    mapStation({ station_id: "disabled", booth: "Booth 2", disabled: true }),
    mapStation({ station_id: "seat", booth: "Booth 2" }),
    mapStation({ station_id: "relay", booth: "Booth 2", game: "relay" }),
  ];
  const marks = new Map<string, SeatMark>([["seat", { state: "open", seconds: 42 }]]);
  const { placed } = placeStations(stations, BOOTH_PLAN, marks);
  expect(new Set(placed.map(({ y }) => y)).size).toBeGreaterThan(1);
  for (const item of placed) {
    const half = markerWidth(item.station, marks.get(item.station.station_id)) / 2;
    expect(item.x - half).toBeGreaterThanOrEqual(304);
    expect(item.x + half).toBeLessThanOrEqual(596);
  }
  for (let i = 0; i < placed.length; i++) {
    for (const right of placed.slice(i + 1)) {
      const left = placed[i]!;
      if (left.y !== right.y) {
        expect(Math.abs(left.y - right.y)).toBeGreaterThanOrEqual(200);
      } else {
        const widths =
          markerWidth(left.station, marks.get(left.station.station_id)) +
          markerWidth(right.station, marks.get(right.station.station_id));
        expect(Math.abs(left.x - right.x)).toBeGreaterThanOrEqual(widths / 2 + 8);
      }
    }
  }
});
