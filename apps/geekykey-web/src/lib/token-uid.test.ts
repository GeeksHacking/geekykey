import { describe, expect, it } from "vitest";

import {
  formatUid,
  formatUidInput,
  isValidUid,
  normalizeUid,
  tokenAddress,
  uidCaretPosition,
} from "@/lib/token-uid";

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

describe("formatUidInput", () => {
  it("groups the UID in colon pairs and upper-cases it", () => {
    expect(formatUidInput("04e45150324189")).toBe("04:E4:51:50:32:41:89");
    expect(formatUidInput("04:E4:51:50:32:41:89")).toBe("04:E4:51:50:32:41:89");
    expect(formatUidInput("04 E4 51 50 32 41 89")).toBe("04:E4:51:50:32:41:89");
  });

  it("groups a partial UID without a trailing colon", () => {
    expect(formatUidInput("")).toBe("");
    expect(formatUidInput("0")).toBe("0");
    expect(formatUidInput("04")).toBe("04");
    expect(formatUidInput("04e")).toBe("04:E");
    expect(formatUidInput("04e4:5")).toBe("04:E4:5");
  });

  it("drops anything that is not a hex digit", () => {
    expect(formatUidInput("04:zE-45")).toBe("04:E4:5");
  });
});

describe("uidCaretPosition", () => {
  it("puts the caret after the same number of hex digits", () => {
    expect(uidCaretPosition("04E", 3, "04:E")).toBe(4);
    expect(uidCaretPosition("04E451", 6, "04:E4:51")).toBe(8);
    expect(uidCaretPosition("E04", 1, "E0:4")).toBe(1);
  });

  it("keeps a middle edit where it was", () => {
    expect(uidCaretPosition("04:E4A:51", 6, "04:E4:A5:1")).toBe(7);
  });

  it("handles a caret at a separator", () => {
    expect(uidCaretPosition("04:E", 3, "04:E")).toBe(2);
  });

  it("handles a deletion and an empty value", () => {
    expect(uidCaretPosition("04:E4:1", 6, "04:E4:1")).toBe(5);
    expect(uidCaretPosition("04:E4:", 6, "04:E4")).toBe(5);
    expect(uidCaretPosition("::", 2, "")).toBe(0);
    expect(uidCaretPosition("", 0, "")).toBe(0);
  });
});

describe("tokenAddress", () => {
  it("is the token page on this site, with the UID as the chip holds it", () => {
    expect(tokenAddress("04 a1 b2 c3 d4 e5 f6")).toBe(`${window.location.origin}/t/04A1B2C3D4E5F6`);
  });
});
