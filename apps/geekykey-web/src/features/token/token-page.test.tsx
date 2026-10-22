import { QueryClientProvider } from "@tanstack/react-query";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { NetworkError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { RequireSession } from "@/features/auth/require-session";
import { TokenPage } from "@/features/token/token-page";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

/** UIDs the fixtures carry, by owner. */
const OWNED_BY_PARTICIPANT = "04A1B2C3D4E5F6";
const OWNED_BY_SOMEONE_ELSE = "04C3D5F70912";
const UNCLAIMED = "04E5F7091B3D";

/** The fixture's owner for OWNED_BY_SOMEONE_ELSE, which must never reach the screen. */
const SOMEONE_ELSES_ID = "p_1041";

function makeApi(latencyMs: readonly [number, number] = [0, 0]) {
  return createMockClient({ latencyMs, storage: null });
}

let api: MockApiClient;
let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  api = makeApi();
  location = stubLocation();
});

afterEach(() => {
  location.restore();
});

/** The gate wrapping the page, as routes/_app/t.$uid.tsx gets it from the _app layout. */
function GatedTokenPage() {
  const { uid = "" } = useParams({ strict: false });
  return (
    <RequireSession>
      <TokenPage uid={uid} />
    </RequireSession>
  );
}

/** Signed in as a user, which is what the page's gate guarantees in production. */
function renderAs(client: MockApiClient, uid: string) {
  const { Providers } = createTestProviders(client, { session: true });
  return render(
    <Providers>
      <TokenPage uid={uid} />
    </Providers>,
  );
}

describe("TokenPage", () => {
  it("opens each event in /me with a button on your own token", async () => {
    // Agreement 8.5's table: your own token carries Release and a button for each event.
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_PARTICIPANT);

    expect(
      await screen.findByRole("button", { name: "Open Capstone Showcase" }),
    ).toBeInTheDocument();
  });

  it("opens the event's screens when the button is pressed", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_PARTICIPANT);

    await userEvent.click(await screen.findByRole("button", { name: "Open Capstone Showcase" }));

    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith("http://localhost:5173/#login=mock"),
    );
  });

  it("shows no event button on a token nobody has claimed", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, UNCLAIMED);

    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("shows no event button on a token someone else holds", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_SOMEONE_ELSE);

    expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("shows no event button when /me lists no events", async () => {
    api.mock.data.event_services = [];
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_PARTICIPANT);

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("shows an unclaimed token as nobody's, with nothing to act on", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, UNCLAIMED);

    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your token" })).toBeInTheDocument();
  });

  it("shows your own token, with nothing to claim", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_PARTICIPANT);

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    // Claim belongs on an unclaimed token (FRO-22), so your own token carries Release
    // (FRO-23) and nothing else.
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
  });

  it("says someone else owns it, with no name and no owner ID", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_SOMEONE_ELSE);

    expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
    // Agreement 8.5: owner_id reaches only a GeekyKey admin, and no name is ever sent,
    // so p_1041's absence from the screen is the observable claim.
    expect(screen.queryByText(new RegExp(SOMEONE_ELSES_ID))).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Wei Lin/i);
  });

  it("normalises a UID with separators or lower case, and shows it readably", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const getToken = vi.spyOn(api, "getToken");
    renderAs(api, "04:a1:b2:c3:d4:e5:f6");

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    expect(screen.getByText("04 A1 B2 C3 D4 E5 F6")).toBeInTheDocument();
    // The normalised form goes on the wire, not the spelling from the address, so the
    // two spellings of one token are one cache entry and one request.
    expect(getToken).toHaveBeenCalledWith(OWNED_BY_PARTICIPANT);
  });

  it("says plainly when the address is not a token's", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, "not-a-uid");

    expect(await screen.findByText("This isn't a GeekyKey token address.")).toBeInTheDocument();
  });

  it("uses agreement 13's wording for claims_unavailable, and retries", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    api.mock.failNext("claims_unavailable");
    renderAs(api, OWNED_BY_PARTICIPANT);

    expect(await screen.findByText("Couldn't reach GeeksHacking. Try again.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    // failNext queues one failure, so the retry reaches the token and the error clears.
    await waitFor(() =>
      expect(screen.queryByText("Couldn't reach GeeksHacking. Try again.")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
  });

  it("uses agreement 13's wording for rate_limited, and offers a retry", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    api.mock.failNext("rate_limited");
    renderAs(api, OWNED_BY_PARTICIPANT);

    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("recovers by itself from a transport failure, without the user retrying", async () => {
    // Only a NetworkError is retried, and only twice. A phone on venue Wi-Fi drops
    // constantly, so one dropped request should not show an error at all.
    //
    // The provider stack in test/providers.tsx sets retry:false so a deliberate failure
    // surfaces at once, so the automatic retry is exercised on a client that keeps its
    // own default instead of the shared test one.
    const retrying = createMockClient({ latencyMs: [0, 0], storage: null });
    const queryClient = createQueryClient({ retryDelay: 0 });
    retrying.mock.setSession(SEEDED_PARTICIPANT_ID);
    const getToken = vi.spyOn(retrying, "getToken");
    getToken.mockRejectedValueOnce(new NetworkError("Could not reach the server"));

    render(
      <ApiProvider client={retrying}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SessionProvider>
              <TokenPage uid={OWNED_BY_PARTICIPANT} />
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ApiProvider>,
    );

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("shows a transport failure once the automatic retries are spent", async () => {
    const failing = createMockClient({ latencyMs: [0, 0], storage: null });
    const queryClient = createQueryClient({ retryDelay: 0 });
    failing.mock.setSession(SEEDED_PARTICIPANT_ID);
    const getToken = vi
      .spyOn(failing, "getToken")
      .mockRejectedValue(new NetworkError("Could not reach the server"));

    render(
      <ApiProvider client={failing}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SessionProvider>
              <TokenPage uid={OWNED_BY_PARTICIPANT} />
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ApiProvider>,
    );

    await waitFor(() => expect(getToken.mock.calls.length).toBeGreaterThanOrEqual(3));
    const alert = await screen.findByRole("alert");
    // describeError's NetworkError wording, carried by ErrorState's own description.
    expect(alert).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("looks a token up once, with the normalised UID", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const getToken = vi.spyOn(api, "getToken");
    renderAs(api, OWNED_BY_PARTICIPANT);

    await screen.findByText("This is your token.");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(OWNED_BY_PARTICIPANT);
  });

  it("shows a skeleton, not the answer, while the lookup is in flight", async () => {
    const slow = makeApi([120, 120]);
    slow.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(slow, OWNED_BY_PARTICIPANT);

    // The skeleton's own label, not its role: the demo-data notice is a status too.
    expect(await screen.findByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("This is your token.")).not.toBeInTheDocument();
    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
  });

  it("says a mock build shows sample data, so a claim here is not a claim on the service", async () => {
    // The tests run on the mock, as `pnpm dev` does, so the page says so rather than let
    // a claim look like it reached the service. A live build has no notice.
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, UNCLAIMED);

    expect(await screen.findByText(/Demo data/)).toBeInTheDocument();
    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
  });

  it("makes no lookup at all while signed out", async () => {
    // Acceptance criterion one: "not logged in (with no lookup made)". Agreement 8.5 is
    // explicit that the page "looks nothing up" before someone is signed in, so this drives
    // the real gate on the real page: the router is needed because RequireSession navigates.
    const anonymous = createMockClient({ latencyMs: [0, 0], storage: null });
    const getToken = vi.spyOn(anonymous, "getToken");
    const { Providers } = createTestProviders(anonymous, { session: true });

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const token = createRoute({
      getParentRoute: () => rootRoute,
      path: "/t/$uid",
      component: GatedTokenPage,
    });
    const login = createRoute({
      getParentRoute: () => rootRoute,
      path: "/login",
      component: () => <p>Login page</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([token, login]),
      history: createMemoryHistory({ initialEntries: [`/t/${OWNED_BY_PARTICIPANT}`] }),
    });

    render(
      <Providers>
        <RouterProvider router={router as never} />
      </Providers>,
    );

    // The gate sends the visitor to /login, so the token route unmounts and nothing asks
    // the service about the token at any point.
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(getToken).not.toHaveBeenCalled();
    expect(screen.queryByText("This is your token.")).not.toBeInTheDocument();
  });

  it("gives a GeekyKey admin the same sentence, with no name", async () => {
    // 8.5 hands an admin owner_id so FRO-23 can release. This asserts the screen leaks no
    // name to them either, and does not special-case the admin away.
    api.mock.setSession(SEEDED_ADMIN_ID);
    renderAs(api, OWNED_BY_SOMEONE_ELSE);

    expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Wei Lin/i);
  });
});
