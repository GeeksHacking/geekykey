import { describe, expect, it } from "vitest";

import { isSafeReturnTo } from "@/features/auth/paths";

describe("isSafeReturnTo", () => {
  it("accepts same-origin paths with query strings and hashes", () => {
    expect(isSafeReturnTo("/t/04A1B2C3D4E5F6")).toBe(true);
    expect(isSafeReturnTo("/admin/stations?status=accepted#latest")).toBe(true);
    expect(isSafeReturnTo("/")).toBe(true);
  });

  it("rejects an address on another site", () => {
    expect(isSafeReturnTo("https://evil.example/steal")).toBe(false);
    expect(isSafeReturnTo("//evil.example/steal")).toBe(false);
    expect(isSafeReturnTo("http://localhost:5173/passport")).toBe(false);
  });

  it("rejects an encoded protocol-relative address and a backslash one", () => {
    expect(isSafeReturnTo("/%2f%2fevil.example/path")).toBe(false);
    expect(isSafeReturnTo("/%5c%5cevil.example/path")).toBe(false);
    expect(isSafeReturnTo("/\\evil.example/path")).toBe(false);
  });

  it("rejects /login, so signing in cannot bounce between itself", () => {
    expect(isSafeReturnTo("/login")).toBe(false);
    expect(isSafeReturnTo("/login/again")).toBe(false);
    expect(isSafeReturnTo("/login?return_to=/t/04A1B2C3D4E5F6")).toBe(false);
  });

  it("rejects control characters, which would split a header", () => {
    expect(isSafeReturnTo("/t/04A1\nX-Test: injected")).toBe(false);
    expect(isSafeReturnTo("/t/04A1\r\nLocation: https://evil.example")).toBe(false);
    expect(isSafeReturnTo("/t/04A1\u0000")).toBe(false);
  });

  it("rejects anything that is not a string or does not start at the root", () => {
    expect(isSafeReturnTo("passport")).toBe(false);
    expect(isSafeReturnTo("../../etc/passwd")).toBe(false);
    expect(isSafeReturnTo(undefined)).toBe(false);
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo(42)).toBe(false);
  });

  it("rejects a malformed percent escape rather than throwing", () => {
    expect(isSafeReturnTo("/t/%E0%A4%A")).toBe(false);
    expect(isSafeReturnTo("/t/%")).toBe(false);
  });
});
