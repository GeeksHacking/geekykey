import { describe, expect, it } from "vitest";

import type { Connection } from "@/api/types";
import { demoOutfitFrom, outfitFrom } from "@/features/passport/avatar/outfit";

function connections(count: number): Connection[] {
  return Array.from({ length: count }, (_, index) => ({
    connected_at: `2026-11-12T08:${String(index).padStart(2, "0")}:00.000Z`,
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
    kind: "B",
    match: null,
    shared: null,
    shared_at: `2026-11-12T08:${String(index + 2).padStart(2, "0")}:00.000Z`,
  }));
}

describe("outfitFrom", () => {
  it("wears no pieces with no connections, and keeps the four slots the caption counts", () => {
    const outfit = outfitFrom([]);

    expect(outfit.slots.map((slot) => slot.piece.key)).toEqual(["hat", "monocle", "cane", "glass"]);
    expect(outfit.slots.map((slot) => slot.worn)).toEqual([false, false, false, false]);
    expect(outfit.worn).toBe(0);
    expect(outfit.complete).toBe(false);
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
