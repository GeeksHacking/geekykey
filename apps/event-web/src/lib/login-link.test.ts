import { afterEach, describe, expect, it } from "vitest";

import { takeLoginLink } from "@/lib/login-link";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("takeLoginLink", () => {
  it("reads the link from the fragment and removes the fragment", () => {
    window.history.replaceState(null, "", "/#login=eyJ2IjoxfQ.c2ln");

    expect(takeLoginLink()).toBe("eyJ2IjoxfQ.c2ln");
    // Agreement 7.4: a reload or a shared screenshot must not carry the link.
    expect(window.location.href).toBe(`${window.location.origin}/`);
  });

  it("keeps the path and the query when it removes the fragment", () => {
    window.history.replaceState(null, "", "/passport?tab=stamps#login=mock");

    expect(takeLoginLink()).toBe("mock");
    expect(window.location.pathname).toBe("/passport");
    expect(window.location.search).toBe("?tab=stamps");
    expect(window.location.hash).toBe("");
  });

  it("does nothing on a page with no login in its fragment", () => {
    window.history.replaceState(null, "", "/activity#recent");

    expect(takeLoginLink()).toBeUndefined();
    expect(window.location.hash).toBe("#recent");
  });

  it("does nothing on a page with no fragment", () => {
    window.history.replaceState(null, "", "/");

    expect(takeLoginLink()).toBeUndefined();
    expect(window.location.href).toBe(`${window.location.origin}/`);
  });
});
