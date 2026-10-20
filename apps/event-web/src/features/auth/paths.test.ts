import { describe, expect, it } from "vitest";

import { isSafeReturnTo } from "@/features/auth/paths";

describe("isSafeReturnTo", () => {
  it("accepts same-origin paths with query strings and hashes", () => {
    expect(isSafeReturnTo("/admin/taps?status=accepted#latest")).toBe(true);
    expect(isSafeReturnTo("/passport")).toBe(true);
  });

  it("rejects external, login, backslash, and control-character paths", () => {
    expect(isSafeReturnTo("//evil.example/path")).toBe(false);
    expect(isSafeReturnTo("/\\evil.example/path")).toBe(false);
    expect(isSafeReturnTo("/%2f%2fevil.example/path")).toBe(false);
    expect(isSafeReturnTo("/login")).toBe(false);
    expect(isSafeReturnTo("/login?return_to=/passport")).toBe(false);
    expect(isSafeReturnTo("/passport\nX-Test: injected")).toBe(false);
  });
});
