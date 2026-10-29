import { describe, expect, it } from "vitest";

import { formatWhen } from "@/lib/format";

describe("formatWhen", () => {
  const now = new Date("2026-10-15T15:00:00");

  it("dates a past claim in 24-hour time", () => {
    expect(formatWhen(new Date("2026-10-10T09:00:00").toISOString(), now)).toBe("10 Oct, 09:00");
  });

  it("names today", () => {
    const claimed = new Date("2026-10-15T09:00:00");
    expect(formatWhen(claimed.toISOString(), now)).toBe("Today, 09:00");
  });

  it("falls back for an unparseable timestamp", () => {
    expect(formatWhen("not-a-date", now)).toBe("Unknown");
  });
});
