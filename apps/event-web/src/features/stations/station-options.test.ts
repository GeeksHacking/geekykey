import { describe, expect, it } from "vitest";

import type { EventStationBoardStation } from "@/api/types";
import {
  allStationOptions,
  passportStationOptions,
  type StationOption,
} from "@/features/stations/station-options";

/** A station with nothing wrong. Each test changes one field. */
function station(overrides: Partial<EventStationBoardStation> = {}): EventStationBoardStation {
  return {
    id: "station-1",
    label: "Reader 3",
    created_at: "2026-10-01T00:00:00.000Z",
    disabled_at: null,
    passport: {
      name: "3D Printing Booth",
      location: "Hall A",
      points: 1,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    last_seen_at: "2026-10-10T09:00:00.000Z",
    online: true,
    firmware_version: "0.3.1",
    buffered_taps: 0,
    reader_ok: true,
    last_tap_at: null,
    ...overrides,
  };
}

const inPassport = station({ id: "in-passport" });
const notInPassport = station({ id: "not-in-passport", passport: null });

describe("passportStationOptions", () => {
  it("offers only stations with passport settings, by passport name", () => {
    const options = passportStationOptions([inPassport, notInPassport]);

    expect(options).toEqual<StationOption[]>([
      { id: "in-passport", name: "3D Printing Booth", online: true },
    ]);
  });

  it("carries whether the station is answering", () => {
    expect(passportStationOptions([station({ online: false })])[0]?.online).toBe(false);
  });

  it("returns nothing for an empty board", () => {
    expect(passportStationOptions([])).toEqual([]);
  });

  it("keeps a disabled station, because 9.2 says it keeps its slot and stamps", () => {
    const disabled = station({ disabled_at: "2026-10-10T09:00:00.000Z" });

    expect(passportStationOptions([disabled])).toHaveLength(1);
  });
});

describe("allStationOptions", () => {
  it("offers every station, naming a passport-less one by its label", () => {
    // 9.2 calls the label the device's name, which is the only name such a station has.
    const options = allStationOptions([inPassport, notInPassport]);

    expect(options).toEqual<StationOption[]>([
      { id: "in-passport", name: "3D Printing Booth", online: true },
      { id: "not-in-passport", name: "Reader 3", online: true },
    ]);
  });

  it("prefers the passport name over the label when there is one", () => {
    const both = station({ label: "Reader 3" });

    expect(allStationOptions([both])[0]?.name).toBe("3D Printing Booth");
  });

  it("keeps the order the board returned", () => {
    const options = allStationOptions([notInPassport, inPassport]);

    expect(options.map((option) => option.id)).toEqual(["not-in-passport", "in-passport"]);
  });

  it("carries whether the station is answering", () => {
    expect(allStationOptions([station({ online: false })])[0]?.online).toBe(false);
  });

  it("returns nothing for an empty board", () => {
    expect(allStationOptions([])).toEqual([]);
  });
});

describe("the projection", () => {
  it("reads only three fields, so nothing can read a field the board dropped", () => {
    const options = allStationOptions([inPassport]);

    expect(options.map((option) => Object.keys(option).sort())).toEqual([["id", "name", "online"]]);
  });
});
