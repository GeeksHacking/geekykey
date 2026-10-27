import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatDayLabel,
  formatPoints,
  formatTime,
  formatTimeWithSeconds,
  formatWhen,
} from "@/lib/format";

describe("formatPoints", () => {
  it("pluralises", () => {
    expect(formatPoints(0)).toBe("0 pts");
    expect(formatPoints(1)).toBe("1 pt");
    expect(formatPoints(2)).toBe("2 pts");
  });
});

describe("invalid timestamps", () => {
  const now = new Date("2026-10-10T09:00:00.000Z");

  it("falls back to a readable value", () => {
    expect(formatDayLabel("not-a-date", now)).toBe("Unknown date");
    expect(formatWhen("not-a-date", now)).toBe("Unknown");
    expect(formatDateTime("not-a-date")).toBe("Not recorded");
  });

  it("never returns an em-dash or en-dash, in any format", () => {
    // The copy rules ban both in visible text, and these helpers are the ones that turn
    // an absent or unparseable timestamp into something a participant reads.
    for (const formatted of [
      formatTime("not-a-date"),
      formatTimeWithSeconds("not-a-date"),
      formatDateTime("not-a-date"),
      formatDayLabel("not-a-date", now),
      formatWhen("not-a-date", now),
    ]) {
      expect(formatted, `returned a dash: ${formatted}`).not.toMatch(/[\u2014\u2013]/);
    }
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
