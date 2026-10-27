import { describe, expect, it } from "vitest";

import { formatUid, isValidUid, normalizeUid } from "@/lib/token-uid";

describe("normalizeUid", () => {
  it("strips separators and upper-cases", () => {
    expect(normalizeUid("04:a1:b2:c3:d4:e5:f6")).toBe("04A1B2C3D4E5F6");
    expect(normalizeUid("04-a1-b2-c3-d4-e5-f6")).toBe("04A1B2C3D4E5F6");
    expect(normalizeUid("04a1b2c3d4e5f6")).toBe("04A1B2C3D4E5F6");
  });
});

describe("isValidUid", () => {
  it("takes 4 to 10 whole bytes", () => {
    expect(isValidUid("04A1B2C3")).toBe(true);
    expect(isValidUid("04A1B2C3D4E5F6A7B8")).toBe(true);
  });

  it("refuses a UID outside 4 to 10 bytes or not a whole byte", () => {
    expect(isValidUid("04A1B2")).toBe(false);
    expect(isValidUid("04A1B2C3D4E5F6A7B8C9D0")).toBe(false);
    expect(isValidUid("04A1B2C3D")).toBe(false);
  });
});

describe("formatUid", () => {
  it("groups the UID in pairs", () => {
    expect(formatUid("04A1B2C3D4E5F6")).toBe("04 A1 B2 C3 D4 E5 F6");
    expect(formatUid("04:a1:b2:c3:d4:e5:f6")).toBe("04 A1 B2 C3 D4 E5 F6");
  });
});
