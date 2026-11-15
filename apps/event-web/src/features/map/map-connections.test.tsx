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

it("counts only participants in links and avoids repeating the count for screen readers", () => {
  render(
    <MapConnections
      connections={{
        count: 3,
        links: [
          [1, 2],
          [2, 4],
          [1, 4],
        ],
      }}
    />,
  );

  const count = screen.getByText("participants connected").closest("p");
  expect(count).toHaveTextContent("3 participants connected");
  expect(count).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "A web of 3 connections between 3 participants. No names are shown.",
  );
});

it("updates the participant count with the web and hides it when no participants are connected", () => {
  const { rerender } = render(<MapConnections connections={{ count: 1, links: [[1, 2]] }} />);
  expect(screen.getByText("participants connected").closest("p")).toHaveTextContent(
    "2 participants connected",
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "A web of 1 connection between 2 participants. No names are shown.",
  );

  rerender(<MapConnections connections={{ count: 0, links: [] }} />);
  expect(screen.queryByText(/participants? connected/)).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("connections").closest("p")).toHaveTextContent("0 connections");
  expect(screen.getByText("connections").closest("p")).not.toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText(/No connections yet/)).toBeInTheDocument();
});
