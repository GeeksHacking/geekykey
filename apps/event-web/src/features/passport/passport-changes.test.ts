import { describe, expect, it } from "vitest";

import type { Connection, MeResponse, Stamp } from "@/api/types";
import { newStampLink, passportChanges } from "@/features/passport/passport-changes";
import { makeMe } from "@/test/make-me";

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

const before = makeMe({ points: 2, stamps: [printing, lounge] });

function stampPrinting(me: MeResponse): MeResponse {
  return {
    ...me,
    points: me.points + 3,
    stamps: [{ ...printing, earned_at: "2026-11-17T02:31:47.000Z" }, lounge],
  };
}

function connection(connected_at: string, fields: Partial<Connection> = {}): Connection {
  return {
    connected_at,
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
    kind: "B",
    match: 60,
    shared: null,
    shared_at: "2026-11-17T02:45:00.000Z",
    ...fields,
  };
}

/** A reaction connection, with the result the service has kept so far. */
function reaction(connected_at: string, result: "win" | "loss" | null): Connection {
  return connection(connected_at, {
    id: "c_reaction",
    dice: null,
    reaction: {
      play_by: connected_at,
      your_play: result === null ? "not_played" : "played",
      your_ms: result === null ? null : 240,
      their_play: result === null ? "not_played" : "played",
      their_ms: result === null ? null : result === "win" ? 287 : 200,
      result,
    },
  });
}

describe("passportChanges", () => {
  it("finds nothing on the first poll", () => {
    expect(passportChanges(undefined, before)).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("finds nothing when a poll changed nothing", () => {
    expect(passportChanges(before, structuredClone(before))).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("finds the slot that filled and the points that went up", () => {
    expect(passportChanges(before, stampPrinting(before))).toEqual({
      stamped: ["printing"],
      points: { from: 2, to: 5 },
      pieces: null,
    });
  });

  it("finds points going up without a new stamp", () => {
    expect(passportChanges(before, { ...before, points: 4 })).toEqual({
      stamped: [],
      points: { from: 2, to: 4 },
      pieces: null,
    });
  });

  it("ignores points going down", () => {
    expect(passportChanges(before, { ...before, points: 0 })).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("ignores a slot that is new since the last poll, even one already stamped", () => {
    const careers: Stamp = { ...lounge, station_id: "careers", name: "Careers Corner" };
    expect(passportChanges(before, { ...before, stamps: [printing, lounge, careers] })).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("finds nothing when someone else signed in", () => {
    const next = stampPrinting(before);
    const someoneElse = { ...next, user: { ...next.user, id: "dev-user-2" } };
    expect(passportChanges(before, someoneElse)).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("ignores a name change", () => {
    const renamed = { ...before, user: { ...before.user, display_name: "Alex T" } };
    expect(passportChanges(before, renamed)).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("finds the connection that arrived, and the pieces before and after", () => {
    const met = connection("2026-11-17T02:40:00.000Z");
    expect(passportChanges(before, { ...before, connections: [met] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 1 },
    });
  });

  it("finds a win's two pieces on the connection that arrived", () => {
    const met = connection("2026-11-17T02:40:00.000Z", {
      dice: { your_roll: 5, their_roll: 2, result: "win" },
    });

    expect(passportChanges(before, { ...before, connections: [met] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 2 },
    });
  });

  it("finds a dice loss's one piece", () => {
    const met = connection("2026-11-17T02:40:00.000Z", {
      dice: { your_roll: 2, their_roll: 5, result: "loss" },
    });

    expect(passportChanges(before, { ...before, connections: [met] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 1 },
    });
  });

  it("finds the extra piece a reaction win brings later, with no new connection", () => {
    const waiting = reaction("2026-11-17T02:40:00.000Z", null);
    const won = reaction("2026-11-17T02:40:00.000Z", "win");
    const withWaiting = { ...before, points: 3, connections: [waiting] };

    expect(passportChanges(withWaiting, { ...withWaiting, connections: [won] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 1, to: 2 },
    });
  });

  it("ignores a reaction loss arriving later", () => {
    const waiting = reaction("2026-11-17T02:40:00.000Z", null);
    const lost = reaction("2026-11-17T02:40:00.000Z", "loss");
    const withWaiting = { ...before, points: 3, connections: [waiting] };

    expect(passportChanges(withWaiting, { ...withWaiting, connections: [lost] })).toEqual({
      stamped: [],
      points: null,
      pieces: null,
    });
  });

  it("ignores a win once the outfit is complete, though its point still counts", () => {
    const twoWins = [
      connection("2026-11-17T02:40:00.000Z", {
        dice: { your_roll: 5, their_roll: 2, result: "win" },
      }),
      connection("2026-11-17T02:41:00.000Z", {
        dice: { your_roll: 5, their_roll: 2, result: "win" },
      }),
    ];
    const threeWins = [
      connection("2026-11-17T02:42:00.000Z", {
        dice: { your_roll: 5, their_roll: 2, result: "win" },
      }),
      ...twoWins,
    ];
    const withTwo = { ...before, points: 4, connections: twoWins };

    expect(passportChanges(withTwo, { ...withTwo, points: 5, connections: threeWins })).toEqual({
      stamped: [],
      points: { from: 4, to: 5 },
      pieces: null,
    });
  });

  it("counts two connections and a win in one poll", () => {
    const first = connection("2026-11-17T02:40:00.000Z");
    const second = connection("2026-11-17T02:41:00.000Z", {
      dice: { your_roll: 5, their_roll: 2, result: "win" },
    });

    expect(passportChanges(before, { ...before, connections: [second, first] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 3 },
    });
  });

  it("gives a tie the extra piece", () => {
    const tie = connection("2026-11-17T02:40:00.000Z", {
      dice: { your_roll: 4, their_roll: 4, result: "win" },
    });

    expect(passportChanges(before, { ...before, connections: [tie] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 2 },
    });
  });

  it("counts every connection that arrived in one poll", () => {
    const first = connection("2026-11-17T02:40:00.000Z");
    const second = connection("2026-11-17T02:41:00.000Z");
    expect(passportChanges(before, { ...before, connections: [second, first] })).toEqual({
      stamped: [],
      points: null,
      pieces: { from: 0, to: 2 },
    });
  });

  it("ignores a connection whose shared answers arrived", () => {
    const met = connection("2026-11-17T02:40:00.000Z");
    const withConnection = { ...before, connections: [met] };
    expect(
      passportChanges(withConnection, {
        ...withConnection,
        connections: [{ ...met, shared: ["drink"], shared_at: "2026-11-17T02:45:00.000Z" }],
      }),
    ).toEqual({ stamped: [], points: null, pieces: null });
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

  it("ignores a connection, which has no stamp page", () => {
    const met = connection("2026-11-17T02:40:00.000Z");
    expect(newStampLink(before, { ...before, connections: [met] })).toEqual({
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
