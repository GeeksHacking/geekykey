import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { ApiError, NetworkError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { RequireSession } from "@/features/auth/require-session";
import { TokenPage } from "@/features/token/token-page";

import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

/**
 * Release on the token page, agreement 8.3 and section 13. One test per acceptance case:
 * an owner's release, an admin's release, not_found and claims_unavailable.
 *
 * Failures are driven by spying on releaseToken rather than failNext, because
 * SessionProvider fetches /me on mount and would spend the queued failure first.
 */

const OWNED_BY_PARTICIPANT = "04A1B2C3D4E5F6";
const OWNED_BY_SOMEONE_ELSE = "04C3D5F70912";

let api: MockApiClient;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
});

function GatedTokenPage() {
  const { uid = "" } = useParams({ strict: false });
  return (
    <RequireSession>
      <TokenPage uid={uid} />
    </RequireSession>
  );
}

/** A client per render, with no retry delay. See the claim tests for why. */
function renderAt(uid: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, staleTime: 5_000 },
      mutations: { retryDelay: 0 },
    },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const token = createRoute({
    getParentRoute: () => rootRoute,
    path: "/t/$uid",
    component: GatedTokenPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([token]),
    history: createMemoryHistory({ initialEntries: [`/t/${uid}`] }),
  });

  const renderResult = render(
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SessionProvider>
            <RouterProvider router={router as never} />
          </SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { router, ...renderResult };
}

/** Opens the confirmation, so the test is asserting on the second click, the real one. */
async function confirmRelease() {
  await userEvent.click(await screen.findByRole("button", { name: "Release" }));
  await userEvent.click(await screen.findByRole("button", { name: "Release token" }));
}

describe("releasing a token from the token page", () => {
  it("asks for confirmation first, and does not release on the first click", async () => {
    const releaseToken = vi.spyOn(api, "releaseToken");
    renderAt(OWNED_BY_PARTICIPANT);

    await userEvent.click(await screen.findByRole("button", { name: "Release" }));

    expect(
      await screen.findByText(
        "Anyone will be able to claim this token. Taps you've already made still count.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
    expect(releaseToken).not.toHaveBeenCalled();
  });

  it("releases the owner's token and then shows it as unclaimed, with a Claim to replace it", async () => {
    const releaseToken = vi.spyOn(api, "releaseToken");
    renderAt(OWNED_BY_PARTICIPANT);

    await confirmRelease();

    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    // An owner releases their own token, so no owner_id: agreement 8.3.
    expect(releaseToken).toHaveBeenCalledWith(OWNED_BY_PARTICIPANT, undefined);
  });

  it("sends the owner_id the lookup loaded, and never looks the token up again to release it", async () => {
    // An admin's release, so the session must be one the fixtures list as an admin.
    api.mock.setSession(SEEDED_ADMIN_ID);
    const releaseToken = vi.spyOn(api, "releaseToken");
    const getToken = vi.spyOn(api, "getToken");
    renderAt(OWNED_BY_SOMEONE_ELSE);

    await screen.findByText("This token belongs to someone else.");
    // One lookup for the page itself.
    expect(getToken).toHaveBeenCalledTimes(1);

    // Opening the confirmation asks the service nothing: 8.3's owner_id comes from the
    // lookup the page already loaded, never a fresh one at click time.
    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(getToken).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Release token" }));

    await waitFor(() => expect(releaseToken).toHaveBeenCalledTimes(1));
    // The fixtures' owner of this token, from the lookup the page loaded.
    expect(releaseToken).toHaveBeenCalledWith(OWNED_BY_SOMEONE_ELSE, "p_1041");
    // A second lookup, and it is the refresh the ticket asks for on success, not a
    // lookup taken to build the request.
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
  });

  it("offers Release to an admin but not to an ordinary user", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const { unmount } = renderAt(OWNED_BY_SOMEONE_ELSE);
    await screen.findByText("This token belongs to someone else.");
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    unmount();

    api.mock.setSession(SEEDED_ADMIN_ID);
    renderAt(OWNED_BY_SOMEONE_ELSE);
    expect(await screen.findByRole("button", { name: "Release" })).toBeInTheDocument();
    // Still no name and no ID of the owner on screen.
    expect(screen.queryByText(/p_1041/)).not.toBeInTheDocument();
  });

  it("says the token is gone from under you on not_found, and refreshes the page's data", async () => {
    const getToken = vi.spyOn(api, "getToken");
    const me = vi.spyOn(api, "me");
    vi.spyOn(api, "releaseToken").mockRejectedValue(new ApiError(404, "not_found"));
    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    await confirmRelease();

    expect(
      await screen.findByText(
        "Someone else has claimed this token now, or it has already been released.",
      ),
    ).toBeInTheDocument();
    // 8.3's not_found means the page is stale, so the lookup and /me are both refetched.
    await waitFor(() => expect(getToken.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(me.mock.calls.length).toBeGreaterThan(1));
  });

  it("uses section 13's wording on claims_unavailable, and keeps Release to try again", async () => {
    const releaseToken = vi.spyOn(api, "releaseToken");
    const me = vi.spyOn(api, "me");
    releaseToken.mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    await confirmRelease();

    expect(await screen.findByText("Couldn't reach GeeksHacking. Try again.")).toBeInTheDocument();
    // No refetch for this one: the service never answered, so the page is not stale.
    expect(me.mock.calls.length).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));
    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
  });

  it("does not retry a release whose answer was lost, so a lost response is not read as a lost token", async () => {
    const releaseToken = vi.spyOn(api, "releaseToken");
    releaseToken.mockRejectedValue(new NetworkError());
    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    await confirmRelease();

    expect(
      await screen.findByText("Could not reach the server. Check the Wi-Fi and try again."),
    ).toBeInTheDocument();
    expect(releaseToken).toHaveBeenCalledTimes(1);
  });
});

describe("releasing twice, and a forbidden release", () => {
  it("cannot send a second DELETE while the first is still in flight", async () => {
    // A release is slow on a phone. Without a guard, reopening and confirming again would
    // send a second DELETE, and 8.3 would answer not_found, which would then be read as
    // someone else having claimed the token.
    const releaseToken = vi.spyOn(api, "releaseToken");
    let finish: () => void = () => {};
    releaseToken.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    await userEvent.click(await screen.findByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));

    // The button says so and cannot be pressed again while the request is out.
    const busy = await screen.findByRole("button", { name: "Releasing" });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(releaseToken).toHaveBeenCalledTimes(1);

    // The stub never released anything in the mock's data, so this only asserts the
    // button is usable again once the request is done. The released state itself is
    // covered by the owner's release test above, which lets the mock do the work.
    finish();
    await waitFor(async () =>
      expect(await screen.findByRole("button", { name: "Release" })).toBeEnabled(),
    );
  });

  it("says the taps are the owner's, not the admin's, when an admin confirms", async () => {
    api.mock.setSession(SEEDED_ADMIN_ID);
    renderAt(OWNED_BY_SOMEONE_ELSE);
    await screen.findByText("This token belongs to someone else.");

    await userEvent.click(await screen.findByRole("button", { name: "Release" }));

    // The owner-facing wording counts "your" taps. An admin has made none, so saying
    // "Taps you've already made" would put words in their mouth.
    expect(
      await screen.findByText(
        "Anyone will be able to claim this token. The taps already made with it still count.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Anyone will be able to claim this token. Taps you've already made still count.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the not-allowed wording on forbidden, and keeps the token page", async () => {
    vi.spyOn(api, "releaseToken").mockRejectedValue(new ApiError(403, "forbidden"));
    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    await confirmRelease();

    expect(await screen.findByText("Your account is not allowed to do that.")).toBeInTheDocument();
    // The page is not replaced: 8.3's forbidden is about the action, not the token.
    expect(screen.getByText("This is your token.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
  });
});
