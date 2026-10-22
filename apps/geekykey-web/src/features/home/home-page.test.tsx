import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { ApiError } from "@/api/errors";
import { RequireSession } from "@/features/auth/require-session";
import { HomePage } from "@/features/home/home-page";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { stubLocation } from "@/test/location";

/*
  My tokens (FRO-27): the list, the empty state and a release, one test per
  acceptance case. The screen is rendered behind the real gate and the real
  session, as it is in the app: HomePage's useMe() only exists once the session
  has resolved, so a direct render without RequireSession would throw while /me
  was still in flight.

  A failing release arrives through spyOn rather than failNext, because the
  session's me call runs on mount and would spend a queued failure first (the
  token page's release tests make the same choice).

  The event buttons (FRO-31) are the ones /me lists, and they open that event's
  screens, so the test presses one and watches the address the mock answers.

  The claim-by-code form (FRO-30) sits above the list, and the form's own tests
  are in claim-by-code-form.test.tsx. What the page decides is where the form
  goes and what the empty state says about it.
*/

const OLDEST = "04 A1 B2 C3 D4 E5 F6";
const NEWEST = "04 B7 C9 E1 F3 A5";
/** A token nobody owns, so the form can claim it (agreement 8.2). */
const UNCLAIMED = "04E5F7091B3D";
const UNCLAIMED_DISPLAYED = "04 E5 F7 09 1B 3D";

let api: MockApiClient;
let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  location = stubLocation();
});

afterEach(() => {
  location.restore();
});

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, staleTime: 5_000 },
      mutations: { retryDelay: 0 },
    },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <RequireSession>
        <HomePage />
      </RequireSession>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
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
}

/** Locates a row by its displayed UID, so a click lands on the right token's Release. */
function rowFor(displayedUid: string) {
  const li = screen.getByText(displayedUid).closest("li");
  if (!li) throw new Error(`no list row renders ${displayedUid}`);
  return within(li);
}

describe("My tokens", () => {
  it("opens each event in /me with a button under the tokens", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();

    // The button is named after the event, as agreement 8.4 says.
    expect(
      await screen.findByRole("button", { name: "Open Capstone Showcase" }),
    ).toBeInTheDocument();
  });

  it("shows no button when /me lists no events", async () => {
    // The events left the service's settings, so /me offers none.
    api.mock.data.event_services = [];
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();

    expect(await screen.findByText(OLDEST)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("opens the event's screens when the button is pressed", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: "Open Capstone Showcase" }));

    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith("http://localhost:5173/#login=mock"),
    );
  });

  it("lists the signed-in user's tokens oldest claim first, as on the token page", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();

    expect(await screen.findByRole("heading", { name: "My tokens" })).toBeInTheDocument();
    // The paired mono format is the token page's, so both screens name a token alike.
    const oldest = screen.getByText(OLDEST);
    const newest = screen.getByText(NEWEST);
    expect(oldest.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Release" })).toHaveLength(2);
    expect(screen.getAllByText(/^Claimed /)).toHaveLength(2);
  });

  it("says what to do next when the user holds no tokens", async () => {
    api.mock.setSession(SEEDED_ADMIN_ID);
    renderHome();

    const sentence = await screen.findByText(
      "You haven't claimed a token yet. Tap one with your phone, or type its code below.",
    );
    expect(sentence).toBeInTheDocument();
    // The sentence says "below", so the form follows it.
    const input = screen.getByLabelText("Token UID");
    expect(sentence.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  });

  it("puts the claim form above the list, and keeps it when there are tokens", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();

    const input = await screen.findByLabelText("Token UID");
    const oldest = screen.getByText(OLDEST);
    // The form comes first, so a second token can be claimed without leaving the page.
    expect(input.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
  });

  it("adds a token claimed by code to the list, because a claim changes what /me holds", async () => {
    api.mock.setSession(SEEDED_ADMIN_ID);
    renderHome();
    await screen.findByText(/You haven't claimed a token yet\./);

    await userEvent.type(screen.getByLabelText("Token UID"), UNCLAIMED);
    await userEvent.click(screen.getByRole("button", { name: "Claim" }));

    expect(await screen.findByText(UNCLAIMED_DISPLAYED)).toBeInTheDocument();
  });

  it("releases a token from its row, and the list drops it", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();
    await screen.findByText(OLDEST);

    await userEvent.click(rowFor(OLDEST).getByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));

    await waitFor(() => expect(screen.queryByText(OLDEST)).not.toBeInTheDocument());
    expect(screen.getByText(NEWEST)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Release" })).toHaveLength(1);
  });

  it("keeps the row and the section 13 wording on a release the service cannot answer", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    vi.spyOn(api, "releaseToken").mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    renderHome();
    await screen.findByText(OLDEST);

    await userEvent.click(rowFor(OLDEST).getByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));

    expect(await screen.findByText("Couldn't reach GeeksHacking. Try again.")).toBeInTheDocument();
    // Nothing was saved, so the list is unchanged and the Release is offered again.
    expect(screen.getByText(OLDEST)).toBeInTheDocument();
    expect(rowFor(OLDEST).getByRole("button", { name: "Release" })).toBeInTheDocument();
  });

  it("says section 13's rate_limited sentence on a release the service will not repeat", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    vi.spyOn(api, "releaseToken").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    renderHome();
    await screen.findByText(OLDEST);

    await userEvent.click(rowFor(OLDEST).getByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));

    // Section 13 gives the 429 wording to My tokens as well as to the token page.
    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();
    // The token is still the user's, so the row stays and Release is offered again.
    expect(screen.getByText(OLDEST)).toBeInTheDocument();
    expect(rowFor(OLDEST).getByRole("button", { name: "Release" })).toBeInTheDocument();
  });

  it("drops a row whose token was released elsewhere, because the page was holding stale data", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderHome();
    await screen.findByText(OLDEST);

    // Released on another device after this page loaded, so the row is stale and 8.3
    // answers not_found.
    const released = api.mock.data.tokens.find((token) => token.uid === "04A1B2C3D4E5F6");
    if (!released) throw new Error("the fixture has no token 04A1B2C3D4E5F6");
    released.owner_id = null;

    await userEvent.click(rowFor(OLDEST).getByRole("button", { name: "Release" }));
    await userEvent.click(await screen.findByRole("button", { name: "Release token" }));

    // not_found means the list is stale, so the release refetches /me and the token that is
    // no longer the user's goes, without the user touching anything else.
    await waitFor(() => expect(screen.queryByText(OLDEST)).not.toBeInTheDocument());
    expect(screen.getByText(NEWEST)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Release" })).toHaveLength(1);
  });
});
