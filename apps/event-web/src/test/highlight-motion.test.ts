import { describe, expect, it } from "vitest";

/*
  docs/design-direction.md, "Motion": a current or selected highlight changes in one frame.
  When the highlight moves between siblings, a colour transition fades the old one out while
  the new one fades in, and both show half-lit for the length of the transition. That was the
  nav's flicker. The check works per file because a component often builds its classes from
  several strings (nav-link.tsx kept the transition and the active fill apart).
*/

const SOURCES = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Variants that mark the current or selected item among its siblings. */
const HIGHLIGHT =
  /data-\[(?:status=active|state=(?:active|selected|checked))\]|aria-(?:current|selected)/;

/** `transition`, `transition-colors`, `transition-all`, or a list that names a colour. */
const COLOUR_TRANSITION =
  /^transition(?:-colors|-all|-\[[^\]]*(?:color|background|fill|stroke)[^\]]*\])?$/;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Class tokens with their variant prefixes (`hover:`, `md:`) taken off. */
function colourTransitions(source: string): string[] {
  return source
    .split(/[\s"'`]+/)
    .filter((token) => COLOUR_TRANSITION.test(token.split(":").pop() ?? ""));
}

describe("a highlight that moves between siblings", () => {
  it("never fades its colour", () => {
    const offenders = Object.entries(SOURCES).flatMap(([file, raw]) => {
      const source = withoutComments(raw);
      if (!HIGHLIGHT.test(source)) return [];
      const found = colourTransitions(source);
      return found.length > 0 ? [`${file}: ${found.join(", ")}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});
