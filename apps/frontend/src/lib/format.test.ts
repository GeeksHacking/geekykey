import { describe, expect, it } from "vitest";

import {
  formatDayLabel,
  formatPoints,
  formatRelative,
  formatUid,
  normaliseUid,
} from "@/lib/format";

describe("formatUid", () => {
  it("groups a normalised UID into byte pairs", () => {
    expect(formatUid("04A1B2C3D4E5F6")).toBe("04 A1 B2 C3 D4 E5 F6");
  });
});

describe("normaliseUid", () => {
  it("mirrors the backend rule: strip separators, upper-case", () => {
    expect(normaliseUid("04:a1:b2:c3:d4:e5:f6")).toBe("04A1B2C3D4E5F6");
    expect(normaliseUid(" 04-a1 b2 ")).toBe("04A1B2");
  });
});

describe("formatPoints", () => {
  it("pluralises", () => {
    expect(formatPoints(0)).toBe("0 pts");
    expect(formatPoints(1)).toBe("1 pt");
    expect(formatPoints(2)).toBe("2 pts");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-10T09:00:00.000Z");
  it("steps through seconds, minutes, and hours", () => {
    expect(formatRelative("2026-10-10T08:59:55.000Z", now)).toBe("just now");
    expect(formatRelative("2026-10-10T08:59:20.000Z", now)).toBe("40 s ago");
    expect(formatRelative("2026-10-10T08:46:00.000Z", now)).toBe("14 min ago");
    expect(formatRelative("2026-10-10T06:00:00.000Z", now)).toBe("3 h ago");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-10-10T15:00:00");
  it("names today and yesterday, dates the rest", () => {
    expect(formatDayLabel(new Date("2026-10-10T09:00:00").toISOString(), now)).toBe("Today");
    expect(formatDayLabel(new Date("2026-10-09T23:30:00").toISOString(), now)).toBe("Yesterday");
    expect(formatDayLabel(new Date("2026-10-01T09:00:00").toISOString(), now)).toBe("1 Oct 2026");
  });
});
