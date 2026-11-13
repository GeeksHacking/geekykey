import { afterEach, describe, expect, it, vi } from "vitest";

import {
  arrivedByLoginLink,
  clearArrivedByLoginLink,
  markArrivedByLoginLink,
} from "@/lib/login-link-arrival";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("gk-arrived-by-login-link");
});

describe("login link arrival", () => {
  it("remembers an arrival until it is cleared", () => {
    expect(arrivedByLoginLink()).toBe(false);

    markArrivedByLoginLink();
    expect(arrivedByLoginLink()).toBe(true);

    clearArrivedByLoginLink();
    expect(arrivedByLoginLink()).toBe(false);
  });

  it("answers false when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

    expect(arrivedByLoginLink()).toBe(false);
  });

  it("does not throw when storage cannot be written or cleared", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

    expect(() => markArrivedByLoginLink()).not.toThrow();
    expect(() => clearArrivedByLoginLink()).not.toThrow();
  });
});
