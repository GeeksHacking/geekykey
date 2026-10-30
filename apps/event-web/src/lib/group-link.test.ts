import { describe, expect, it } from "vitest";

import { GROUP_LINK_MAX, isGroupLink } from "@/lib/group-link";

const HTTPS = "https://example.com/group";

describe("isGroupLink", () => {
  it("accepts https in either case, and trims", () => {
    expect(isGroupLink(HTTPS)).toBe(true);
    expect(isGroupLink("HTTPS://example.com/group")).toBe(true);
    expect(isGroupLink(`  ${HTTPS}  `)).toBe(true);
  });

  it("rejects http, a missing // and a missing scheme", () => {
    expect(isGroupLink("http://example.com/group")).toBe(false);
    expect(isGroupLink("https:example.com/group")).toBe(false);
    expect(isGroupLink("example.com/group")).toBe(false);
  });

  it("counts 300 code points, not UTF-16 units", () => {
    const room = GROUP_LINK_MAX - [...HTTPS].length;
    expect(isGroupLink(HTTPS + "a".repeat(room))).toBe(true);
    expect(isGroupLink(HTTPS + "a".repeat(room + 1))).toBe(false);
    // Each emoji is two UTF-16 units but one code point, so .length would refuse this.
    expect(isGroupLink(HTTPS + "😀".repeat(room))).toBe(true);
  });
});
