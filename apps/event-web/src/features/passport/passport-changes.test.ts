import { describe, expect, it } from "vitest";

import type { MeResponse, Stamp } from "@/api/types";
import { newStampLink, passportChanges } from "@/features/passport/passport-changes";

const printing: Stamp = {
  station_id: "printing",
  name: "3D Printing Booth",
  location: "Hall A",
  points: 3,
  link: "https://example.com/3d-printing",
  earned_at: null,
};
const lounge: Stamp = {
  station_id: "lounge",
  name: "Hardware Lounge",
  location: null,
  points: 2,
  link: null,
  earned_at: "2026-11-17T02:14:09.000Z",
};

const before: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant", has_name: true },
  points: 2,
  stamps: [printing, lounge],
  recent_taps: [],
};

function stampPrinting(me: MeResponse): MeResponse {
  return {
    ...me,
    points: me.points + 3,
    stamps: [{ ...printing, earned_at: "2026-11-17T02:31:47.000Z" }, lounge],
  };
}

describe("passportChanges", () => {
  it("finds nothing on the first poll", () => {
    expect(passportChanges(undefined, before)).toEqual({ stamped: [], points: null });
  });

  it("finds nothing when a poll changed nothing", () => {
    expect(passportChanges(before, structuredClone(before))).toEqual({ stamped: [], points: null });
  });

  it("finds the slot that filled and the points that went up", () => {
    expect(passportChanges(before, stampPrinting(before))).toEqual({
      stamped: ["printing"],
      points: { from: 2, to: 5 },
    });
  });

  it("finds points going up without a new stamp", () => {
    expect(passportChanges(before, { ...before, points: 4 })).toEqual({
      stamped: [],
      points: { from: 2, to: 4 },
    });
  });

  it("ignores points going down", () => {
    expect(passportChanges(before, { ...before, points: 0 })).toEqual({
      stamped: [],
      points: null,
    });
  });

  it("ignores a slot that is new since the last poll, even one already stamped", () => {
    const careers: Stamp = { ...lounge, station_id: "careers", name: "Careers Corner" };
    expect(passportChanges(before, { ...before, stamps: [printing, lounge, careers] })).toEqual({
      stamped: [],
      points: null,
    });
  });

  it("finds nothing when someone else signed in", () => {
    const next = stampPrinting(before);
    const someoneElse = { ...next, user: { ...next.user, id: "dev-user-2" } };
    expect(passportChanges(before, someoneElse)).toEqual({ stamped: [], points: null });
  });

  it("ignores a name change", () => {
    const renamed = { ...before, user: { ...before.user, display_name: "Alex T" } };
    expect(passportChanges(before, renamed)).toEqual({ stamped: [], points: null });
  });
});

describe("newStampLink", () => {
  it("finds nothing on the first poll", () => {
    expect(newStampLink(undefined, before)).toEqual({ changed: false, offer: null });
  });

  it("finds nothing when no stamp filled", () => {
    expect(newStampLink(before, structuredClone(before))).toEqual({
      changed: false,
      offer: null,
    });
  });

  it("offers the new stamp's name and link", () => {
    expect(newStampLink(before, stampPrinting(before))).toEqual({
      changed: true,
      offer: {
        station_id: "printing",
        name: "3D Printing Booth",
        link: "https://example.com/3d-printing",
      },
    });
  });

  it("reports a new stamp without a link, so the screen clears the old offer", () => {
    const after = stampPrinting(before);
    const noLink: MeResponse = {
      ...after,
      stamps: [{ ...printing, link: null, earned_at: "2026-11-17T02:31:47.000Z" }, lounge],
    };
    expect(newStampLink(before, noLink)).toEqual({ changed: true, offer: null });
  });

  it("picks the newest new stamp that has a link", () => {
    const careers: Stamp = {
      station_id: "careers",
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      link: "https://example.com/careers",
      earned_at: null,
    };
    const beforeTwo: MeResponse = { ...before, stamps: [printing, careers, lounge] };
    const afterTwo: MeResponse = {
      ...beforeTwo,
      points: 7,
      stamps: [
        { ...printing, earned_at: "2026-11-17T02:31:47.000Z" },
        { ...careers, earned_at: "2026-11-17T02:32:00.000Z" },
        lounge,
      ],
    };
    expect(newStampLink(beforeTwo, afterTwo)).toEqual({
      changed: true,
      offer: {
        station_id: "careers",
        name: "Careers Corner",
        link: "https://example.com/careers",
      },
    });
  });

  it("falls back to the older new stamp when the newest has no link", () => {
    const careers: Stamp = {
      station_id: "careers",
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      link: null,
      earned_at: null,
    };
    const beforeTwo: MeResponse = { ...before, stamps: [printing, careers, lounge] };
    const afterTwo: MeResponse = {
      ...beforeTwo,
      stamps: [
        { ...printing, earned_at: "2026-11-17T02:31:47.000Z" },
        { ...careers, earned_at: "2026-11-17T02:32:00.000Z" },
        lounge,
      ],
    };
    expect(newStampLink(beforeTwo, afterTwo)).toEqual({
      changed: true,
      offer: {
        station_id: "printing",
        name: "3D Printing Booth",
        link: "https://example.com/3d-printing",
      },
    });
  });

  it("ignores a slot that is new since the last poll, even one already stamped", () => {
    const careers: Stamp = {
      station_id: "careers",
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      link: "https://example.com/careers",
      earned_at: "2026-11-17T02:32:00.000Z",
    };
    expect(newStampLink(before, { ...before, stamps: [printing, lounge, careers] })).toEqual({
      changed: false,
      offer: null,
    });
  });

  it("finds nothing when someone else signed in", () => {
    const next = stampPrinting(before);
    const someoneElse = { ...next, user: { ...next.user, id: "dev-user-2" } };
    expect(newStampLink(before, someoneElse)).toEqual({ changed: false, offer: null });
  });
});
