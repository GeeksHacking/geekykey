import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/layout/account-menu";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { THEME_STORAGE_KEY } from "@/lib/theme";

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
      <AccountMenu userId={SEEDED_PARTICIPANT_ID} isGeekyKeyAdmin={false} onSignOut={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent(
      SEEDED_PARTICIPANT_ID,
    );
  });

  it("calls onSignOut when Sign out is chosen", async () => {
    const onSignOut = vi.fn();
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_PARTICIPANT_ID} isGeekyKeyAdmin={false} onSignOut={onSignOut} />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("offers a link to My tokens", async () => {
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_PARTICIPANT_ID} isGeekyKeyAdmin={false} onSignOut={() => {}} />,
    );

    await openMenu(user);
    // asChild makes the menu item itself the anchor, so its own href is the link.
    const link = screen.getByRole("menuitem", { name: /My tokens/ });
    expect(link).toHaveAttribute("href", "/");
  });

  it("marks a GeekyKey admin in the menu", async () => {
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_ADMIN_ID} isGeekyKeyAdmin onSignOut={() => {}} />,
    );

    await openMenu(user);
    expect(screen.getByText("GeekyKey admin")).toBeInTheDocument();
  });

  it("offers an admin no admin console, because there are none (agreement 13)", async () => {
    // Section 13: "There are no GeekyKey admin screens." A GeekyKey admin's one job is
    // releasing someone else's token from the token page (8.5), not a console of their own.
    // FRO-21, which would have added the route, is cancelled.
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_ADMIN_ID} isGeekyKeyAdmin onSignOut={() => {}} />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    // The role still reads, and sign out still works, so an admin is not left without a menu.
    expect(screen.getByText("GeekyKey admin")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("does not offer the admin console to a plain participant", async () => {
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_PARTICIPANT_ID} isGeekyKeyAdmin={false} onSignOut={() => {}} />,
    );

    await openMenu(user);
    expect(screen.queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    expect(screen.getByText("Participant")).toBeInTheDocument();
  });

  it("leaves the theme alone, so signing out cannot change the stored preference", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { user } = await renderMenu(
      <AccountMenu userId={SEEDED_PARTICIPANT_ID} isGeekyKeyAdmin={false} onSignOut={() => {}} />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light"));
    localStorage.clear();
  });
});
