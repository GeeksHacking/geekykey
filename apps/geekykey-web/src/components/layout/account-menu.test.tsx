import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/layout/account-menu";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { EventServiceLink } from "@/api/types";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const EVENTS: EventServiceLink[] = [
  { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
];
const MORE_EVENTS: EventServiceLink[] = [
  ...EVENTS,
  { id: "grad-tea", name: "Grad Tea", url: "https://event.geekshacking.com" },
];

/**
 * The menu uses Link, so it needs a router. The router's own outlet renders the menu,
 * because RouterProvider only renders children once it has matched a route, and it does
 * not synchronously on the first paint.
 */
function renderMenuSync(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>Login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router as never} />);
  return { router, user: userEvent.setup() };
}

/** RouterProvider matches the first route asynchronously, so every test waits for the menu. */
async function renderMenu(ui: ReactNode) {
  const rendered = renderMenuSync(ui);
  await screen.findByRole("button", { name: "Account menu" });
  return rendered;
}

/**
 * Opens the menu with the keyboard. A Radix menu opened by a synthetic click only mounts in
 * the first test of a file here, so a later test would fail with "element not found" for a
 * reason that has nothing to do with the app.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Account menu" }).focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menuitem", { name: /Sign out/ });
}

describe("AccountMenu", () => {
  it("shows the user ID, because the service keeps no display name", async () => {
    await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent(
      SEEDED_PARTICIPANT_ID,
    );
  });

  it("keeps an icon showing when the user ID is hidden on a phone", async () => {
    await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    // Below `sm` the user ID and caret are display: none, so the icon is the whole
    // button; from `sm` up the ID returns. jsdom applies no Tailwind, so the
    // classes are what this can read.
    expect(within(trigger).getByText(SEEDED_PARTICIPANT_ID)).toHaveClass("hidden", "sm:inline");
    const visibleIcons = [...trigger.querySelectorAll("svg")].filter(
      (icon) => !icon.classList.contains("hidden"),
    );
    expect(visibleIcons).toHaveLength(1);
  });

  it("calls onSignOut when Sign out is chosen", async () => {
    const onSignOut = vi.fn();
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={onSignOut}
      />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("hides the My tokens link when the shell says so", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens={false}
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /My tokens/ })).not.toBeInTheDocument();
  });

  it("shows My tokens when the shell says so", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    // asChild makes the menu item itself the anchor, so its own href is the link.
    const link = screen.getByRole("menuitem", { name: /My tokens/ });
    expect(link).toHaveAttribute("href", "/");
  });

  it("marks a GeekyKey admin in the menu", async () => {
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_ADMIN_ID} isGeekyKeyAdmin showMyTokens onSignOut={() => {}} />,
    );

    await openMenu(user);
    expect(screen.getByText("GeekyKey admin")).toBeInTheDocument();
  });

  it("offers the token kinds screen to someone who can see it", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_ADMIN_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        canViewTokenKinds
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: /Token kinds/ })).toHaveAttribute(
      "href",
      "/admin/token-kinds",
    );
  });

  it("doesn't offer the token kinds screen to anyone else", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /Token kinds/ })).not.toBeInTheDocument();
  });

  it("offers a GeekyKey admin no console: the token kinds screen is the one screen they have", async () => {
    // FRO-21, which would have added a console, is cancelled. A GeekyKey admin releases
    // someone else's token from the token page (8.5), and loads kinds on their own screen.
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_ADMIN_ID} isGeekyKeyAdmin showMyTokens onSignOut={() => {}} />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    // The role still reads, and sign out still works, so an admin is not left without a menu.
    expect(screen.getByText("GeekyKey admin")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("does not offer the admin console to a plain participant", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    expect(screen.getByText("Participant")).toBeInTheDocument();
  });

  it("leaves the theme alone, so signing out cannot change the stored preference", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light"));
    localStorage.clear();
  });

  it("offers Event screens when there is one event", async () => {
    const onEvent = vi.fn();
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        events={EVENTS}
        onEvent={onEvent}
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Event screens" }));

    expect(onEvent).toHaveBeenCalledWith("showcase");
  });

  it("offers each event in a submenu when there are several", async () => {
    const onEvent = vi.fn();
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        events={MORE_EVENTS}
        onEvent={onEvent}
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    const trigger = screen.getByRole("menuitem", { name: "Event screens" });
    trigger.focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "Grad Tea" }));

    expect(onEvent).toHaveBeenCalledWith("grad-tea");
  });

  it("hides Event screens when there are no events", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: "Event screens" })).not.toBeInTheDocument();
  });

  it("keeps Event screens off while the link is being made", async () => {
    const { user } = await renderMenu(
      <AccountMenu
        userId={SEEDED_PARTICIPANT_ID}
        isGeekyKeyAdmin={false}
        showMyTokens
        events={EVENTS}
        onEvent={() => {}}
        eventLinkPending
        onSignOut={() => {}}
      />,
    );

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Event screens" })).toHaveAttribute(
      "data-disabled",
    );
  });
});
