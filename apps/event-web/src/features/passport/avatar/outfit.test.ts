import { describe, expect, it } from "vitest";

import type { Connection } from "@/api/types";
import { CHARACTERS } from "@/features/passport/avatar/art";
import { demoOutfitFrom, outfitFrom } from "@/features/passport/avatar/outfit";

function connection(connectedAt: string, fields: Partial<Connection> = {}): Connection {
  return {
    connected_at: connectedAt,
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
    kind: "B",
    match: null,
    shared: null,
    shared_at: connectedAt,
    ...fields,
  };
}

function connections(count: number): Connection[] {
  return Array.from({ length: count }, (_, index) =>
    connection(`2026-11-12T08:${String(index).padStart(2, "0")}:00.000Z`),
  );
}

/** A connection whose dice the guest won, or lost. */
function dice(at: string, result: "win" | "loss"): Connection {
  return connection(at, {
    dice:
      result === "win"
        ? { your_roll: 5, their_roll: 2, result }
        : { your_roll: 2, their_roll: 5, result },
  });
}

/** A reaction connection, with the result the service has kept so far. */
function reaction(at: string, result: "win" | "loss" | null): Connection {
  return connection(at, {
    id: "c_reaction",
    dice: null,
    reaction: {
      play_by: at,
      your_play: result === null ? "not_played" : "played",
      your_ms: result === null ? null : 240,
      their_play: result === null ? "not_played" : "played",
      their_ms: result === null ? null : result === "win" ? 287 : 200,
      result,
    },
  });
}

describe("outfitFrom", () => {
  it("wears no pieces with no connections, and keeps the four slots the caption counts", () => {
    const outfit = outfitFrom([]);

    expect(outfit.slots.map((slot) => slot.piece.key)).toEqual(["hat", "monocle", "cane", "glass"]);
    expect(outfit.slots.map((slot) => slot.worn)).toEqual([false, false, false, false]);
    expect(outfit.worn).toBe(0);
    expect(outfit.complete).toBe(false);
  });

  it("gives a win two pieces and a loss one", () => {
    expect(outfitFrom([dice("2026-11-12T08:00:00.000Z", "win")]).worn).toBe(2);
    expect(outfitFrom([dice("2026-11-12T08:00:00.000Z", "loss")]).worn).toBe(1);
  });

  it("gives a tie the extra piece, since the service answers win for both", () => {
    const tie = connection("2026-11-12T08:00:00.000Z", {
      dice: { your_roll: 4, their_roll: 4, result: "win" },
    });

    expect(outfitFrom([tie]).worn).toBe(2);
    expect(outfitFrom([reaction("2026-11-12T08:00:00.000Z", "win")]).worn).toBe(2);
  });

  it("gives an older connection one piece, with no challenge to win", () => {
    expect(outfitFrom([connection("2026-11-12T08:00:00.000Z")]).worn).toBe(1);
  });

  it("gives a reaction connection one piece until its result comes, then the extra for a win", () => {
    expect(outfitFrom([reaction("2026-11-12T08:00:00.000Z", null)]).worn).toBe(1);
    expect(outfitFrom([reaction("2026-11-12T08:00:00.000Z", "win")]).worn).toBe(2);
    expect(outfitFrom([reaction("2026-11-12T08:00:00.000Z", "loss")]).worn).toBe(1);
  });

  it("completes the outfit sooner when the guest wins", () => {
    expect(
      outfitFrom([dice("2026-11-12T08:00:00.000Z", "win"), dice("2026-11-12T08:01:00.000Z", "win")])
        .complete,
    ).toBe(true);
    expect(
      outfitFrom([
        dice("2026-11-12T08:00:00.000Z", "win"),
        dice("2026-11-12T08:01:00.000Z", "loss"),
      ]).complete,
    ).toBe(false);
  });

  it("stops at four pieces, and leaves a complete outfit alone when a win comes later", () => {
    const complete = outfitFrom([
      dice("2026-11-12T08:00:00.000Z", "win"),
      dice("2026-11-12T08:01:00.000Z", "win"),
    ]);
    const more = outfitFrom([
      dice("2026-11-12T08:00:00.000Z", "win"),
      dice("2026-11-12T08:01:00.000Z", "win"),
      dice("2026-11-12T08:02:00.000Z", "win"),
    ]);

    expect(more.slots).toEqual(complete.slots);
    expect(more.worn).toBe(4);
    expect(more.complete).toBe(true);
  });

  it("keeps the pieces in their fixed order, so a win's extra is the next one", () => {
    expect(
      outfitFrom([dice("2026-11-12T08:00:00.000Z", "win")]).slots.map((slot) => slot.worn),
    ).toEqual([true, true, false, false]);
  });

  it("gives every character the same number of pieces, which the poll's change marks rely on", () => {
    const counts = Object.values(CHARACTERS).map((character) => character.pieces.length);

    expect(new Set(counts).size).toBe(1);
  });

  it("gives the first connection the first piece, and each next connection the next", () => {
    expect(outfitFrom(connections(1)).slots.map((slot) => slot.worn)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(outfitFrom(connections(2)).slots.map((slot) => slot.worn)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(outfitFrom(connections(3)).slots.map((slot) => slot.worn)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("completes the outfit on the fourth connection", () => {
    const outfit = outfitFrom(connections(4));

    expect(outfit.worn).toBe(4);
    expect(outfit.complete).toBe(true);
    expect(outfitFrom(connections(3)).complete).toBe(false);
  });

  it("stays complete after a fifth connection, wearing the same four pieces", () => {
    const fourth = outfitFrom(connections(4));
    const fifth = outfitFrom(connections(5));

    expect(fifth.slots).toEqual(fourth.slots);
    expect(fifth.worn).toBe(4);
    expect(fifth.complete).toBe(true);
  });

  it("dresses the character in a dress in her own pieces", () => {
    const outfit = outfitFrom(connections(2), "dress");

    expect(outfit.slots.map((slot) => slot.piece.key)).toEqual([
      "feather",
      "pearls",
      "cane",
      "glass",
    ]);
    expect(outfit.slots.map((slot) => slot.worn)).toEqual([true, true, false, false]);
  });

  it("gives a dress's win the next two pieces in her own order", () => {
    const outfit = outfitFrom([dice("2026-11-12T08:00:00.000Z", "win")], "dress");

    expect(outfit.slots.map((slot) => slot.piece.key)).toEqual([
      "feather",
      "pearls",
      "cane",
      "glass",
    ]);
    expect(outfit.slots.map((slot) => slot.worn)).toEqual([true, true, false, false]);
  });
});

describe("demoOutfitFrom", () => {
  it("gives every piece, worn only when the demo put it on", () => {
    const outfit = demoOutfitFrom("suit", ["cane"]);

    expect(outfit.slots.map((slot) => [slot.piece.key, slot.worn])).toEqual([
      ["hat", false],
      ["monocle", false],
      ["cane", true],
      ["glass", false],
    ]);
    expect(outfit.complete).toBe(false);
  });

  it("is complete once every piece is on", () => {
    const outfit = demoOutfitFrom("suit", ["hat", "monocle", "cane", "glass"]);

    expect(outfit.worn).toBe(4);
    expect(outfit.complete).toBe(true);
  });
});
