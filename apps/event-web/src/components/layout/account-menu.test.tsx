import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/api/types";
import { AccountMenu } from "@/components/layout/account-menu";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

const user = { id: "user-1", display_name: "Alex Tan", role: "participant" } as User;

function renderMenu({
  consoleLink,
  onSignOut = vi.fn(),
}: {
  consoleLink?: "admin" | "participant";
  onSignOut?: () => void;
} = {}) {
  const rootRoute = createRootRoute({
    component: () => <AccountMenu user={user} onSignOut={onSignOut} consoleLink={consoleLink} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

/*
  A Radix menu opened by a synthetic click only mounts in the first test of a file in
  jsdom, so the menu is opened with the keyboard, as the other suites do.
*/
async function openMenu(person: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", { name: "Account menu" });
  trigger.focus();
  await person.keyboard("{Enter}");
  return screen.findByRole("menu");
}

describe("AccountMenu", () => {
  it("puts My tokens first, opening the key screens in a new tab", async () => {
    const person = userEvent.setup();
    renderMenu();
    const menu = await openMenu(person);

    const [first] = within(menu).getAllByRole("menuitem");
    expect(first).toHaveTextContent("My tokens");
    expect(first).toHaveAttribute("href", GEEKYKEY_SCREENS_URL);
    expect(first).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("rel", "noreferrer");
  });

  it("leaves the key site to My tokens, with no second item", async () => {
    const person = userEvent.setup();
    renderMenu();
    const menu = await openMenu(person);

    expect(within(menu).queryByRole("menuitem", { name: "Key screens" })).not.toBeInTheDocument();
  });

  it("keeps Sign out and the console link when there is another view", async () => {
    const person = userEvent.setup();
    renderMenu({ consoleLink: "admin" });
    const menu = await openMenu(person);

    expect(within(menu).getByRole("menuitem", { name: "Organiser console" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("offers the participant view from the organiser console", async () => {
    const person = userEvent.setup();
    renderMenu({ consoleLink: "participant" });
    const menu = await openMenu(person);

    expect(within(menu).getByRole("menuitem", { name: "Participant view" })).toBeInTheDocument();
  });

  it("shows no console link when the user has only one view", async () => {
    const person = userEvent.setup();
    renderMenu();
    const menu = await openMenu(person);

    expect(
      within(menu).queryByRole("menuitem", { name: "Organiser console" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Participant view" }),
    ).not.toBeInTheDocument();
  });

  it("signs out from the menu", async () => {
    const person = userEvent.setup();
    const onSignOut = vi.fn();
    renderMenu({ onSignOut });
    const menu = await openMenu(person);

    await person.click(within(menu).getByRole("menuitem", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
