import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EventServiceLink } from "@/api/types";
import { PlaceMenu } from "@/components/layout/place-menu";

const events: EventServiceLink[] = [
  { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
  { id: "hackomania", name: "Hackomania", url: "https://hackomania.example.com" },
];

async function renderMenu(availableEvents = events, pending = false) {
  const onEvent = vi.fn();
  const person = userEvent.setup();
  const rootRoute = createRootRoute({
    component: () => (
      <PlaceMenu events={availableEvents} onEvent={onEvent} eventLinkPending={pending} />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  if (availableEvents.length > 0)
    await screen.findByRole("button", {
      name: pending ? "Opening event" : "Switch place, My tokens",
    });
  else await screen.findByText("My tokens");
  return { person, onEvent };
}

async function openMenu(person: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: /Switch place, My tokens|Opening event/ }).focus();
  await person.keyboard("{Enter}");
  await screen.findByRole("menu");
}

describe("PlaceMenu", () => {
  it("shows every event directly and opens the chosen event", async () => {
    const { person, onEvent } = await renderMenu();
    await openMenu(person);
    expect(screen.getByRole("menuitem", { name: "Capstone Showcase" })).toBeInTheDocument();
    await person.click(screen.getByRole("menuitem", { name: "Hackomania" }));
    expect(onEvent).toHaveBeenCalledExactlyOnceWith("hackomania");
  });

  it("blocks event presses while a login link is pending", async () => {
    const { person, onEvent } = await renderMenu(events, true);
    expect(screen.getByRole("button", { name: "Opening event" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await openMenu(person);
    const item = screen.getByRole("menuitem", { name: "Capstone Showcase" });
    expect(item).toHaveAttribute("data-disabled");
    await person.keyboard("{ArrowDown}{Enter}");
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("has no empty menu when there are no events", async () => {
    await renderMenu([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
