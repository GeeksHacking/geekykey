import { describe, expect, it } from "vitest";

import type { ApiClient } from "@/api/client";
import { dataSourceMessage, isLeftOnMock, isMockData } from "@/api/mode";

describe("frontend data source mode", () => {
  it("marks token data as demo in full mock mode", () => {
    expect(isMockData(false)).toBe(true);
    expect(dataSourceMessage(false)).toBe("Demo data. This screen shows sample data.");
  });

  it("uses no em-dash or en-dash in either notice", () => {
    // The copy rules ban both in visible text, and this notice sits above the claim
    // button, so it is the most-read string on the page.
    for (const message of [dataSourceMessage(false), dataSourceMessage(true)]) {
      expect(message, `returned a dash: ${message}`).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("keeps the notice while any token method is still mocked", () => {
    // Section 13's wording, exactly.
    expect(dataSourceMessage(true)).toBe(
      "Demo data. This page shows sample tokens, so claiming or releasing one changes nothing.",
    );
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

  it("leaves a method on the mock only in a live build that has not wired it", () => {
    const liveMethods = new Set<keyof ApiClient>(["me", "devLogin", "firebaseLogin", "logout"]);

    expect(isLeftOnMock("releaseToken", true, liveMethods)).toBe(true);
    expect(isLeftOnMock("me", true, liveMethods)).toBe(false);
    // A mock build has no service answers to mix the mock's up with.
    expect(isLeftOnMock("releaseToken", false, liveMethods)).toBe(false);
  });
});
