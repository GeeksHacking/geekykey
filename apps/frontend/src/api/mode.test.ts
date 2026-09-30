import { describe, expect, it } from "vitest";

import { dataSourceMessage, isMockData } from "@/api/mode";
import type { ApiClient } from "@/api/client";

describe("frontend data source mode", () => {
  it("marks all screens as demo data in full mock mode", () => {
    expect(isMockData("admin", false)).toBe(true);
    expect(isMockData("pair", false)).toBe(true);
    expect(dataSourceMessage("admin", false)).toContain("fixture data");
  });

  it("keeps the notice while any method on a screen is still mocked", () => {
    expect(dataSourceMessage("admin", true)).toContain("organiser resource data");
    expect(dataSourceMessage("pair", true)).toContain("token pairing");
    const liveMethods = new Set<keyof ApiClient>([
      "me",
      "devLogin",
      "logout",
      "loginUrl",
      "listStations",
      "pairToken",
    ]);

    expect(isMockData("admin", true, liveMethods)).toBe(true);
    expect(isMockData("pair", true, liveMethods)).toBe(true);

    liveMethods.add("createStation");
    liveMethods.add("listTaps");
    liveMethods.add("createFallbackTap");
    liveMethods.add("stats");
    liveMethods.add("exportCsv");
    liveMethods.add("unpairToken");
    expect(isMockData("admin", true, liveMethods)).toBe(false);
    expect(isMockData("pair", true, liveMethods)).toBe(false);
  });
});
