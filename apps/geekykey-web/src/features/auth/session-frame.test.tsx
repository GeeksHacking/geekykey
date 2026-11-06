import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
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
  // Sonner keeps its queue in module state, so a toast raised in one test would otherwise
  // be replayed into the Toaster mounted by the next one.
  toast.dismiss();
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
    // No admin console either way: FRO-21 was canceled. A GeekyKey admin's one screen is
    // Token kinds, and they release a token from the token page (8.5).
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
    // Nothing to report: the sign-out worked, and the login screen explains itself.
    expect(document.querySelector("[data-sonner-toast]")).toBeNull();
  });

  it("shows the error message when signing out fails, and lands on /login anyway", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    // The service answers 503 to the logout. The provider settles the session regardless, so
    // the screens leave for /login, and the message has to outlive that redirect.
    api.mock.failNext("service_unavailable");

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
    expect(
      await screen.findByText("A required service is unavailable. Try again shortly."),
    ).toBeInTheDocument();
  });

  /** Chooses Sign out as a guest, and answers with the warning that opens. */
  async function askToSignOutAsGuest(user: ReturnType<typeof userEvent.setup>) {
    isSignedInAsGuest.mockResolvedValue(true);
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    return screen.findByRole("alertdialog", { name: "Sign out of this guest login?" });
  }

  it("warns a guest with tokens before signing out, and nothing has happened yet", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const before = await api.me();

    const dialog = await askToSignOutAsGuest(user);

    expect(dialog).toHaveTextContent(
      "You can't log back in as this guest, and your tokens will be released so anyone can claim them. Your connections and points stay as they are.",
    );
    expect(router.state.location.pathname).toBe("/");
    expect(await api.me()).toMatchObject({ tokens: before.tokens });
  });

  it("releases every token a guest holds and signs them out, so someone else can claim them", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const { tokens } = await api.me();
    expect(tokens.length).toBeGreaterThan(1);

    const dialog = await askToSignOutAsGuest(user);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });

    api.mock.setSession(SEEDED_ADMIN_ID);
    for (const { uid } of tokens) {
      await expect(api.claimToken(uid)).resolves.toMatchObject({ uid });
    }
  });

  it("releases a token claimed since the warning opened", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    const dialog = await askToSignOutAsGuest(user);
    // Another tab of the same browser claims one more, which this page's /me hasn't read.
    const token = await api.claimToken("04FFEEDDCCBBAA");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    api.mock.setSession(SEEDED_ADMIN_ID);
    await expect(api.claimToken(token.uid)).resolves.toMatchObject({ uid: token.uid });
  });

  it("counts a token that has gone already as released", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const { tokens } = await api.me();
    const { releaseToken } = api;
    // Agreement 8.3: a release whose answer went wrong answers not_found when tried again.
    vi.spyOn(api, "releaseToken").mockImplementationOnce(async (uid, ownerId) => {
      await releaseToken(uid, ownerId);
      await releaseToken(uid, ownerId);
    });

    const dialog = await askToSignOutAsGuest(user);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(api.releaseToken).toHaveBeenCalledTimes(tokens.length);
  });

  it("keeps a guest signed in and says why when a release fails, and trying again finishes", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const { tokens } = await api.me();
    const { releaseToken } = api;
    vi.spyOn(api, "releaseToken")
      .mockImplementationOnce(releaseToken)
      .mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));

    const dialog = await askToSignOutAsGuest(user);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't release your tokens, so you're still signed in.");
    expect(alert).toHaveTextContent("Couldn't reach GeeksHacking. Try again.");
    expect(router.state.location.pathname).toBe("/");
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });

    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    api.mock.setSession(SEEDED_ADMIN_ID);
    for (const { uid } of tokens) {
      await expect(api.claimToken(uid)).resolves.toMatchObject({ uid });
    }
  });

  it("releases nobody's tokens when another tab has changed who is signed in", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const release = vi.spyOn(api, "releaseToken");

    const dialog = await askToSignOutAsGuest(user);
    // Another tab signed the guest out and logged in with Google. This page hasn't read /me since.
    api.mock.setSession(SEEDED_ADMIN_ID);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Signing out" })).toBeNull());
    expect(release).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/");
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_ADMIN_ID } });
  });

  it("asks Firebase about the user in this session, not whoever it remembers", async () => {
    const user = userEvent.setup();
    signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });

    await askToSignOutAsGuest(user);

    expect(isSignedInAsGuest).toHaveBeenCalledWith(SEEDED_PARTICIPANT_ID);
  });

  it("warns a guest with no tokens only about losing the login", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_ADMIN_ID);
    await screen.findByRole("button", { name: "Account menu" });
    expect((await api.me()).tokens).toEqual([]);
    const release = vi.spyOn(api, "releaseToken");

    const dialog = await askToSignOutAsGuest(user);

    expect(dialog).toHaveTextContent(
      "You can't log back in as this guest. Your connections and points stay as they are.",
    );
    expect(dialog).not.toHaveTextContent("released");

    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(release).not.toHaveBeenCalled();
  });

  it("keeps a guest signed in with their tokens when they choose to stay", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const before = await api.me();

    const dialog = await askToSignOutAsGuest(user);
    await user.click(within(dialog).getByRole("button", { name: "Stay signed in" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/");
    expect(await api.me()).toMatchObject({
      user: { id: SEEDED_PARTICIPANT_ID },
      tokens: before.tokens,
    });
  });

  it("keeps a Google user's tokens when they sign out", async () => {
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const { tokens } = await api.me();
    const release = vi.spyOn(api, "releaseToken");

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(release).not.toHaveBeenCalled();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    expect(await api.me()).toMatchObject({ tokens });
  });

  it("releases nothing and stays signed in when Firebase can't say whether the user is a guest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSignedInAsGuest.mockRejectedValue(new Error("Firebase didn't load"));
    const user = userEvent.setup();
    const { router, api } = signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("button", { name: "Account menu" });
    const release = vi.spyOn(api, "releaseToken");

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));

    expect(await screen.findByText("Couldn't check your login. Try again.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(release).not.toHaveBeenCalled();
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("has a theme toggle on a signed-in screen as well as on the login page", async () => {
    signedInAs(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("button", { name: "Change theme" })).toBeInTheDocument();
  });

  it("offers the event switch from the session's events", async () => {
    signedInAs(SEEDED_PARTICIPANT_ID);
    await screen.findByRole("heading", { name: "My tokens" });

    const sites = screen.getByRole("navigation", { name: "Sites" });
    expect(within(sites).getByText("Key")).toHaveAttribute("aria-current", "page");
    expect(within(sites).getByRole("button", { name: "Event" })).toBeInTheDocument();
  });
});
