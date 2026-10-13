import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDayLabel,
  formatPoints,
  formatRelative,
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

describe("formatRelative", () => {
  const now = new Date("2026-10-10T09:00:00.000Z");
  it("steps through seconds, minutes, and hours", () => {
    expect(formatRelative("2026-10-10T08:59:55.000Z", now)).toBe("just now");
    expect(formatRelative("2026-10-10T08:59:20.000Z", now)).toBe("40 s ago");
    expect(formatRelative("2026-10-10T08:46:00.000Z", now)).toBe("14 min ago");
    expect(formatRelative("2026-10-10T06:00:00.000Z", now)).toBe("3 h ago");
  });

  it("does not throw for an invalid API timestamp", () => {
    expect(formatRelative("not-a-date", now)).toBe("Unknown");
    expect(formatDayLabel("not-a-date", now)).toBe("Unknown date");
    expect(formatWhen("not-a-date", now)).toBe("Unknown");
    expect(formatDate("not-a-date")).toBe("Not recorded");
  });

  it("never returns an em-dash or en-dash, in any format", () => {
    // The copy rules ban both in visible text, and these helpers are the ones that turn
    // an absent or unparseable timestamp into something a participant reads.
    for (const formatted of [
      formatTime("not-a-date"),
      formatTimeWithSeconds("not-a-date"),
      formatDate("not-a-date"),
      formatDateTime("not-a-date"),
      formatRelative("not-a-date", now),
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
