import { describe, expect, it } from "vitest";

import type { Stamp } from "@/api/types";
import { outfitFrom } from "@/features/passport/avatar/outfit";

function stamp(name: string, earned_at: string | null = null): Stamp {
  return {
    station_id: `station-${name}`,
    name,
    location: null,
    points: 10,
    link: null,
    earned_at,
  };
}

describe("outfitFrom", () => {
  it("gives each stamp slot, in the order 8.1 lists them, the piece in the same place", () => {
    const outfit = outfitFrom([
      stamp("Cloud Sponsor", "2026-11-12T08:01:00.000Z"),
      stamp("Robotics Club"),
      stamp("Art Room", "2026-11-12T08:14:00.000Z"),
    ]);

    expect(outfit.slots.map((slot) => [slot.piece.key, slot.stamp.name, slot.worn])).toEqual([
      ["hat", "Cloud Sponsor", true],
      ["monocle", "Robotics Club", false],
      ["cane", "Art Room", true],
    ]);
    expect(outfit.worn).toBe(2);
  });

  it("counts an event with fewer slots than pieces as complete once every slot is stamped", () => {
    const outfit = outfitFrom([
      stamp("Cloud Sponsor", "2026-11-12T08:01:00.000Z"),
      stamp("Robotics Club", "2026-11-12T08:03:00.000Z"),
    ]);

    expect(outfit.slots).toHaveLength(2);
    expect(outfit.complete).toBe(true);
  });

  it("gives no piece to a slot past the last piece", () => {
    const stamps = ["A", "B", "C", "D", "E"].map((name) => stamp(name, "2026-11-12T08:00:00.000Z"));

    const outfit = outfitFrom(stamps);

    expect(outfit.slots.map((slot) => slot.piece.key)).toEqual(["hat", "monocle", "cane", "glass"]);
    expect(outfit.worn).toBe(4);
    expect(outfit.complete).toBe(true);
  });

  it("dresses the character in a dress in her own pieces", () => {
    const stamps = ["A", "B", "C", "D"].map((name) => stamp(name));

    expect(outfitFrom(stamps, "dress").slots.map((slot) => slot.piece.key)).toEqual([
      "feather",
      "pearls",
      "cane",
      "glass",
    ]);
  });

  it("is not complete with no slots at all", () => {
    expect(outfitFrom([]).complete).toBe(false);
  });

  it("is not complete while one slot is still empty", () => {
    const outfit = outfitFrom([stamp("A", "2026-11-12T08:00:00.000Z"), stamp("B")]);

    expect(outfit.complete).toBe(false);
  });
});
