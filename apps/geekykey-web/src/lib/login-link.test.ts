import { afterEach, describe, expect, it } from "vitest";

import { takeLoginLink } from "@/lib/login-link";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("takeLoginLink", () => {
  it("reads the link from the fragment and removes the fragment", () => {
    window.history.replaceState(null, "", "/#login=eyJ2IjoxfQ.c2ln");

    expect(takeLoginLink()).toBe("eyJ2IjoxfQ.c2ln");
    // Agreement 7.5: a reload or a shared screenshot must not carry the link.
    expect(window.location.href).toBe(`${window.location.origin}/`);
  });

  it("keeps the path and the query when it removes the fragment", () => {
    window.history.replaceState(null, "", "/t/04A1B2C3D4E5F6?x=1#login=mock");

    expect(takeLoginLink()).toBe("mock");
    expect(window.location.pathname).toBe("/t/04A1B2C3D4E5F6");
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("");
  });

  it("does nothing on a page with no login in its fragment", () => {
    window.history.replaceState(null, "", "/sign-out#user=someone");

    expect(takeLoginLink()).toBeUndefined();
    expect(window.location.hash).toBe("#user=someone");
  });

  it("does nothing on a page with no fragment", () => {
    window.history.replaceState(null, "", "/");

    expect(takeLoginLink()).toBeUndefined();
    expect(window.location.href).toBe(`${window.location.origin}/`);
  });
});
