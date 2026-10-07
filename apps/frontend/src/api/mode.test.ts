import { describe, expect, it } from "vitest";

import type { ApiClient } from "@/api/client";
import { dataSourceMessage, isMockData } from "@/api/mode";

describe("frontend data source mode", () => {
  it("marks organiser data as demo in full mock mode", () => {
    expect(isMockData(false)).toBe(true);
    expect(dataSourceMessage(false)).toContain("fixture data");
  });

  it("keeps the notice while any organiser method is still mocked", () => {
    expect(dataSourceMessage(true)).toContain("organiser resource data");
    const liveMethods = new Set<keyof ApiClient>([
      "me",
      "devLogin",
      "logout",
      "loginUrl",
      "listStations",
    ]);

    expect(isMockData(true, liveMethods)).toBe(true);

    liveMethods.add("listStationBoard");
    liveMethods.add("createStation");
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
      "listStations",
      "createStation",
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
      "listStations",
      "createStation",
      "listStationBoard",
      "listTaps",
      "createFallbackTap",
      "stats",
      "exportCsv",
    ]);

    expect(isMockData(true, liveMethods)).toBe(true);
  });
});
