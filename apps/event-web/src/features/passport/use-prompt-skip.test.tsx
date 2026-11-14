import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { usePromptSkip } from "@/features/passport/use-prompt-skip";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("usePromptSkip", () => {
  it("remembers a visit skip in sessionStorage, per user", () => {
    const { result } = renderHook(() => usePromptSkip("u1", "test-key", "visit"));

    expect(result.current.skipped).toBe(false);
    act(() => result.current.skip());

    expect(result.current.skipped).toBe(true);
    expect(sessionStorage.getItem("test-key:u1")).toBe("1");
    expect(localStorage.getItem("test-key:u1")).toBeNull();
  });

  it("remembers a browser skip in localStorage, and another user is still asked", () => {
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string }) => usePromptSkip(userId, "test-key", "browser"),
      { initialProps: { userId: "u1" } },
    );

    act(() => result.current.skip());
    expect(localStorage.getItem("test-key:u1")).toBe("1");
    expect(sessionStorage.getItem("test-key:u1")).toBeNull();

    rerender({ userId: "u2" });
    expect(result.current.skipped).toBe(false);
  });

  it("reads a browser skip saved before the hook mounted", () => {
    localStorage.setItem("test-key:u1", "1");

    const { result } = renderHook(() => usePromptSkip("u1", "test-key", "browser"));

    expect(result.current.skipped).toBe(true);
  });
});
