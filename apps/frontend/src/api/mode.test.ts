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

    liveMethods.add("createStation");
    liveMethods.add("listTaps");
    liveMethods.add("createFallbackTap");
    liveMethods.add("stats");
    liveMethods.add("exportCsv");
    expect(isMockData(true, liveMethods)).toBe(false);
  });
});
