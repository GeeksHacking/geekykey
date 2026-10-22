import { vi } from "vitest";

/**
 * jsdom does not navigate, so a screen that opens an address is stubbed here.
 *
 * The whole location is replaced rather than only its assign method, because a
 * location's own properties cannot be deleted again, and a test that stubbed one
 * would leak it into the next test in the same file.
 */
export function stubLocation() {
  const original = window.location;
  const assign = vi.fn();

  Object.defineProperty(window, "location", {
    value: {
      href: original.href,
      origin: original.origin,
      protocol: original.protocol,
      host: original.host,
      hostname: original.hostname,
      port: original.port,
      pathname: original.pathname,
      search: original.search,
      hash: original.hash,
      assign,
      replace: vi.fn(),
      reload: vi.fn(),
      toString: () => original.href,
    },
    writable: true,
    configurable: true,
  });

  return {
    /** The stub that stands in for the browser's navigation. */
    assign,
    restore() {
      Object.defineProperty(window, "location", {
        value: original,
        writable: true,
        configurable: true,
      });
    },
  };
}
