import { describe, expect, it } from "vitest";

import type { ApiClient } from "@/api/client";
import { dataSourceMessage, isMockData } from "@/api/mode";

describe("frontend data source mode", () => {
  it("marks organiser data as demo in full mock mode", () => {
    expect(isMockData(false)).toBe(true);
    expect(dataSourceMessage(false)).toContain("fixture data");
  });

  it("uses no em-dash or en-dash in either notice", () => {
    // The copy rules ban both in visible text, and this notice sits above every organiser
    // screen, so it is the most-read string in the console.
    for (const message of [dataSourceMessage(false), dataSourceMessage(true)]) {
      expect(message, `returned a dash: ${message}`).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("keeps the notice while any organiser method is still mocked", () => {
    // Matched case-insensitively: the sentence after the full stop is capitalised, and the
    // assertion is about which notice this is, not how it is punctuated.
    expect(dataSourceMessage(true)).toMatch(/organiser resource data/i);
    const liveMethods = new Set<keyof ApiClient>(["me", "devLogin", "logout", "loginUrl"]);

    expect(isMockData(true, liveMethods)).toBe(true);

    liveMethods.add("listStationBoard");
    liveMethods.add("createStation");
    liveMethods.add("replaceStationKey");
    liveMethods.add("setStationPassport");
    liveMethods.add("listTaps");
    liveMethods.add("createFallbackTap");
    liveMethods.add("stats");
    liveMethods.add("exportCsv");
    expect(isMockData(true, liveMethods)).toBe(false);
  });

  it("keeps the notice when only the station board is still mocked", () => {
    const liveMethods = new Set<keyof ApiClient>([
      "me",
      "devLogin",
      "logout",
      "loginUrl",
      "createStation",
      "replaceStationKey",
      "listTaps",
      "createFallbackTap",
      "stats",
      "exportCsv",
    ]);

    expect(isMockData(true, liveMethods)).toBe(true);
  });

  it("keeps the notice while only the passport settings are still mocked", () => {
    const liveMethods = new Set<keyof ApiClient>([
      "me",
      "devLogin",
      "logout",
      "loginUrl",
      "createStation",
      "replaceStationKey",
      "listStationBoard",
      "listTaps",
      "createFallbackTap",
      "stats",
      "exportCsv",
    ]);

    expect(isMockData(true, liveMethods)).toBe(true);
  });
});
