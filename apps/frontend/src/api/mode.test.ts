import { describe, expect, it } from "vitest";

import { dataSourceMessage, isMockData } from "@/api/mode";

describe("frontend data source mode", () => {
  it("marks all screens as demo data in full mock mode", () => {
    expect(isMockData("admin", false)).toBe(true);
    expect(isMockData("pair", false)).toBe(true);
    expect(dataSourceMessage("admin", false)).toContain("fixture data");
  });

  it("only marks screens whose resource methods are still mocked", () => {
    expect(isMockData("admin", true)).toBe(true);
    expect(isMockData("pair", true)).toBe(true);
    expect(dataSourceMessage("admin", true)).toContain("organiser resource data");
    expect(dataSourceMessage("pair", true)).toContain("token pairing");
  });
});
