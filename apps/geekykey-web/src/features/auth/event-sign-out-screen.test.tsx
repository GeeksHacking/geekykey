import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { ApiProvider } from "@/api/provider";
import { EVENT_SCREENS_URL } from "@/lib/constants";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";
import { stubLocation } from "@/test/location";

const { isSignedInAsGuest } = vi.hoisted(() => ({ isSignedInAsGuest: vi.fn() }));

// The test build has no Firebase, so whether the user is a guest is the one answer stubbed.
vi.mock("@/lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firebase")>()),
  isSignedInAsGuest,
}));

const EVENT_LOGIN = `${EVENT_SCREENS_URL}login`;
const MOCK_LOGIN_LINK_URL = "http://localhost:5173/#login=mock";

let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  location = stubLocation();
  isSignedInAsGuest.mockReset();
  isSignedInAsGuest.mockResolvedValue(true);
  toast.dismiss();
});

afterEach(() => {
  location.restore();
  vi.restoreAllMocks();
});

/**
 * The Event screens send a person here after logging them out there, naming who they were,
 * so the page opens in the state a real arrival has.
 */
function arriveFromEvent({
  session = SEEDED_PARTICIPANT_ID,
  named = SEEDED_PARTICIPANT_ID,
  api = createMockClient({ latencyMs: [0, 0], storage: null }),
}: {
  session?: string | null;
  named?: string | null;
  api?: ReturnType<typeof createMockClient>;
} = {}) {
  api.mock.setSession(session);
  const hash = named === null ? "" : `#user=${encodeURIComponent(named)}`;
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/sign-out${hash}`] }),
  });
  render(
    <ApiProvider client={api}>
      <QueryClientProvider client={createQueryClient({ retry: false })}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router as never} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { api, router };
}

const warning = () => screen.findByRole("alertdialog", { name: "Sign out of this guest login?" });

describe("signing out from the Event screens, on the GeekyKey screens", () => {
  it("warns the guest the Event screens named, before anything is released", async () => {
    const { api } = arriveFromEvent();

    expect(await warning()).toHaveTextContent("your tokens will be released");
    expect((await api.me()).tokens.length).toBeGreaterThan(0);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("releases the guest's tokens, signs them out here, and goes back to the event's login", async () => {
    const { api } = arriveFromEvent();
    const { tokens } = await api.me();
    const user = userEvent.setup();

    await user.click(within(await warning()).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
    api.mock.setSession(SEEDED_ADMIN_ID);
    for (const { uid } of tokens) {
      await expect(api.claimToken(uid)).resolves.toMatchObject({ uid });
    }
  });

  it("keeps a guest signed in here and says why when a release fails", async () => {
    const { api } = arriveFromEvent();
    vi.spyOn(api, "releaseToken").mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    const user = userEvent.setup();
    const dialog = await warning();

    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Couldn't release your tokens, so you're still signed in.",
    );
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("takes a guest who stays back to the event through a login link, with their tokens", async () => {
    const { api } = arriveFromEvent();
    const { tokens } = await api.me();
    const user = userEvent.setup();

    await user.click(within(await warning()).getByRole("button", { name: "Stay signed in" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(MOCK_LOGIN_LINK_URL));
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID }, tokens });
    // The page is leaving, but this person chose to stay, so nothing says they're signing out.
    expect(screen.queryByRole("button", { name: "Signing out" })).not.toBeInTheDocument();
  });

  it("shows My tokens and says why when the way back fails, since the guest is still signed in here", async () => {
    const { api, router } = arriveFromEvent();
    vi.spyOn(api, "createLoginLink").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    const user = userEvent.setup();

    await user.click(within(await warning()).getByRole("button", { name: "Stay signed in" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("goes straight back without asking when the user isn't a guest, and leaves them signed in here", async () => {
    isSignedInAsGuest.mockResolvedValue(false);
    const { api } = arriveFromEvent();
    const release = vi.spyOn(api, "releaseToken");

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(release).not.toHaveBeenCalled();
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("goes straight back when nobody is signed in here, since there's nothing it can release", async () => {
    arriveFromEvent({ session: null });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("leaves another guest's tokens alone when someone else is signed in here", async () => {
    const { api } = arriveFromEvent({ named: "someone-who-left" });
    const release = vi.spyOn(api, "releaseToken");

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(release).not.toHaveBeenCalled();
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("does nothing to a session when the address names nobody, so a link can't ask for a sign-out", async () => {
    const { api } = arriveFromEvent({ named: null });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("releases nothing and offers to try again when Firebase can't say, then carries on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSignedInAsGuest.mockRejectedValueOnce(new Error("Firebase didn't load"));
    const { api } = arriveFromEvent();
    const release = vi.spyOn(api, "releaseToken");
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't check your login. Try again.",
    );
    expect(release).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Try again/ }));

    expect(await warning()).toBeInTheDocument();
  });

  it("offers the way back to the event when Firebase can't say, so nobody is stuck here", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSignedInAsGuest.mockRejectedValue(new Error("Firebase didn't load"));
    const { api } = arriveFromEvent();
    const release = vi.spyOn(api, "releaseToken");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Back to the event" }));

    expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN);
    expect(release).not.toHaveBeenCalled();
  });

  it("offers the way back to the event when /me can't be read", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(503, "claims_unavailable"));
    arriveFromEvent({ api });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Back to the event" }));

    expect(window.location.replace).toHaveBeenCalledWith(EVENT_LOGIN);
  });
});
