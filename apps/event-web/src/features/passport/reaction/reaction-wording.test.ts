import { describe, expect, it } from "vitest";

import { timeLeftLine } from "@/features/passport/reaction/reaction-wording";

describe("timeLeftLine", () => {
  it("says minutes and two-digit seconds", () => {
    expect(timeLeftLine(120)).toBe("Time left to play: 2:00.");
    expect(timeLeftLine(69)).toBe("Time left to play: 1:09.");
    expect(timeLeftLine(1)).toBe("Time left to play: 0:01.");
    expect(timeLeftLine(0)).toBe("Time left to play: 0:00.");
  });
});
