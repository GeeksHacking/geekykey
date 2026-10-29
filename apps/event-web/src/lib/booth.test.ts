import { describe, expect, it } from "vitest";

import { isBooth } from "@/lib/booth";

describe("the booth rule (agreement 9.12)", () => {
  it("allows a blank booth, which means none", () => {
    expect(isBooth("")).toBe(true);
    expect(isBooth("   ")).toBe(true);
  });

  it("trims before it counts, so spaces do not make a booth too long", () => {
    expect(isBooth(`  ${"x".repeat(80)}  `)).toBe(true);
  });

  it("refuses 81 characters", () => {
    expect(isBooth("x".repeat(80))).toBe(true);
    expect(isBooth("x".repeat(81))).toBe(false);
  });

  // 41 emoji are 82 UTF-16 units and 41 code points, and 9.12 counts code points.
  it("counts code points, so a booth of 41 emoji fits", () => {
    expect("🙂".repeat(41).length).toBe(82);
    expect(isBooth("🙂".repeat(41))).toBe(true);
    expect(isBooth("🙂".repeat(81))).toBe(false);
  });
});
