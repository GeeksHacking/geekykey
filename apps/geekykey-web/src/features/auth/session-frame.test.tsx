import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient } from "@/api/mock/client";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";

const { isSignedInAsGuest } = vi.hoisted(() => ({ isSignedInAsGuest: vi.fn() }));

/*
  Whether the user is a guest is Firebase's to say, and the test build has no Firebase, so
  that one answer is stubbed. Everything else in the module is the real one: with no config,
  signing out of Firebase does nothing.
*/
vi.mock("@/lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firebase")>()),
  isSignedInAsGuest,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  isSignedInAsGuest.mockReset();
  isSignedInAsGuest.mockResolvedValue(false);
});

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

  it("reads the GeekyKey admin flag from /me and labels the account, with no admin row", async () => {
    const user = userEvent.setup();
    signedInAs(SEEDED_ADMIN_ID);
    // Wait for the page itself, so the menu opens on a session whose flag is read.
    await screen.findByRole("heading", { name: "My tokens" });

    const menu = await openAccountMenu(user);

    // The flag still reads, so the account says who it is.
    expect(within(menu).getByText("GeekyKey admin")).toBeInTheDocument();
    // No admin row either way: agreement 13 says there are no GeekyKey admin screens, and
    // an admin's one job is releasing a token from the token page (8.5).
    expect(within(menu).queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
  });

  it("reads the flag the other way too, so a plain participant is labelled as one", async () => {
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
    // A Google user can sign in again as themselves, so nobody asks them first.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks a guest before signing them out, in section 13's words", async () => {
    isSignedInAsGuest.mockResolvedValue(true);
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Sign out of this guest login?",
    });
    expect(dialog).toHaveTextContent(
      "You can't log back in as this guest, so your tokens and stamps stay with it. If you sign out by mistake, ask at the desk to release your tokens so you can claim them again.",
    );
    // Nothing has happened yet: the guest is still signed in.
    expect(router.state.location.pathname).toBe("/");
    await expect(api.me()).resolves.toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });

    // The sign-out stays available, because it's how a shared phone goes to the next person.
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("keeps a guest signed in when they choose to stay", async () => {
    isSignedInAsGuest.mockResolvedValue(true);
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Stay signed in" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/");
    await expect(api.me()).resolves.toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("asks anyway when Firebase can't say whether the user is a guest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSignedInAsGuest.mockRejectedValue(new Error("Firebase didn't load"));
    const user = userEvent.setup();
    const { router } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    expect(
      await screen.findByRole("alertdialog", { name: "Sign out of this guest login?" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("has a theme toggle on a signed-in screen as well as on the login page", async () => {
    signedInAs(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("button", { name: "Change theme" })).toBeInTheDocument();
  });
});
