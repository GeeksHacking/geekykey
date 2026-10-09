import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient } from "@/api/mock/client";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

/*
  The signed-in shell, which `routes/_app.tsx` mounts and nothing else renders.

  SessionFrame is where `/me` becomes what the account menu shows, and where Sign out is
  wired to the session. The account-menu tests pass props straight into AccountMenu, so they
  cannot see any of this: forcing `isGeekyKeyAdmin={false}`, and forcing it to `true`, both
  left the whole suite green. These tests drive the real route tree instead, so the wiring
  from `/me` to the menu is covered.
*/
function signedInAs(userId: string) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(userId);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = createQueryClient({ retry: false });
  render(
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router as never} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { router, api };
}

/**
 * A Radix menu opened by a synthetic click only mounts in the first test of a file in jsdom,
 * so the menu is opened with the keyboard, as the other suites in this app do.
 */
async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const menuButton = await screen.findByRole("button", { name: "Account menu" });
  menuButton.focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu");
}

describe("the signed-in shell", () => {
  it("shows the user ID from /me", async () => {
    signedInAs(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("button", { name: "Account menu" })).toHaveTextContent(
      SEEDED_PARTICIPANT_ID,
    );
  });

  it("reads the GeekyKey admin flag from /me, so the admin row appears for an admin", async () => {
    const user = userEvent.setup();
    signedInAs(SEEDED_ADMIN_ID);
    await screen.findByText(/a GeekyKey admin/);

    const menu = await openAccountMenu(user);

    expect(within(menu).getByText("GeekyKey admin")).toBeInTheDocument();
    // Present but not a link: there is no /admin route, so linking would 404.
    const row = within(menu).getByRole("menuitem", { name: /Admin console/ });
    expect(row).toHaveAttribute("data-disabled");
    expect(row.querySelector("a")).toBeNull();
  });

  it("reads the flag the other way too, so a plain participant gets no admin row", async () => {
    const user = userEvent.setup();
    signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const menu = await openAccountMenu(user);

    expect(within(menu).queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    expect(within(menu).getByText("Participant")).toBeInTheDocument();
  });

  it("signs out from the menu, ending the session and landing on /login", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    // The mock's own session is gone, so the app cannot recover it on the next read.
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("has a theme toggle on a signed-in screen as well as on the login page", async () => {
    signedInAs(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("button", { name: "Change theme" })).toBeInTheDocument();
  });
});
