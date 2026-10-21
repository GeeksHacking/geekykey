import { describe, expect, it } from "vitest";

import type { ApiClient } from "@/api/client";
import { dataSourceMessage, isMockData } from "@/api/mode";

describe("frontend data source mode", () => {
  it("marks token data as demo in full mock mode", () => {
    expect(isMockData(false)).toBe(true);
    expect(dataSourceMessage(false)).toContain("fixture data");
  });

  it("uses no em-dash or en-dash in either notice", () => {
    // The copy rules ban both in visible text, and this notice sits above the claim
    // button, so it is the most-read string on the page.
    for (const message of [dataSourceMessage(false), dataSourceMessage(true)]) {
      expect(message, `returned a dash: ${message}`).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("keeps the notice while any token method is still mocked", () => {
    // Matched case-insensitively: the sentence after the full stop is capitalised, and
    // the assertion is about which notice this is, not how it is punctuated.
    expect(dataSourceMessage(true)).toMatch(/token data is still mocked/i);
    const liveMethods = new Set<keyof ApiClient>(["me", "devLogin", "firebaseLogin", "logout"]);

    expect(isMockData(true, liveMethods)).toBe(true);

    liveMethods.add("getToken");
    liveMethods.add("claimToken");
    liveMethods.add("releaseToken");
    expect(isMockData(true, liveMethods)).toBe(false);
  });

  it("keeps the notice while only the lookup is still mocked", () => {
    const liveMethods = new Set<keyof ApiClient>([
      "me",
      "devLogin",
      "firebaseLogin",
      "logout",
      "claimToken",
      "releaseToken",
    ]);

    expect(isMockData(true, liveMethods)).toBe(true);
  });
});
