import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

/*
  Radix Select calls these on the trigger during pointer interaction. jsdom implements
  neither, and without them opening the listbox throws before any option renders.
*/
const POINTER_METHODS = [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView",
];
if (typeof Element !== "undefined") {
  const prototype = Element.prototype as unknown as Record<string, unknown>;
  for (const method of POINTER_METHODS) {
    if (typeof prototype[method] !== "function") prototype[method] = vi.fn();
  }
}

// jsdom has no matchMedia. Report "no light preference" so the theme falls back to dark.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
