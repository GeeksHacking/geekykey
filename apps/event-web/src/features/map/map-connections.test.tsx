import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { MapConnections } from "@/features/map/map-connections";

it("caps the size of a small web and keeps its frame through nearby additions", () => {
  const { rerender } = render(<MapConnections connections={{ count: 1, links: [[1, 2]] }} />);
  expect(screen.getByRole("img")).toHaveAttribute("viewBox", "-160 -160 320 320");
  rerender(
    <MapConnections
      connections={{
        count: 2,
        links: [
          [1, 2],
          [2, 3],
        ],
      }}
    />,
  );
  expect(screen.getByRole("img")).toHaveAttribute("viewBox", "-160 -160 320 320");
  rerender(
    <MapConnections
      connections={{
        count: 4,
        links: [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
      }}
    />,
  );
  expect(screen.getByRole("img")).toHaveAttribute("viewBox", "-160 -160 320 320");
});

it("frames the current extent in steps without clipping a larger crowd", () => {
  const { rerender } = render(<MapConnections connections={{ count: 1, links: [[1, 35]] }} />);
  const original = document.querySelector('[data-web-node="1"]')?.getAttribute("transform");
  expect(screen.getByRole("img")).toHaveAttribute("viewBox", "-160 -160 320 320");
  rerender(
    <MapConnections
      connections={{
        count: 2,
        links: [
          [1, 35],
          [35, 100],
        ],
      }}
    />,
  );
  expect(screen.getByRole("img")).toHaveAttribute("viewBox", "-280 -280 560 560");
  expect(document.querySelector('[data-web-node="1"]')).toHaveAttribute("transform", original);
});
