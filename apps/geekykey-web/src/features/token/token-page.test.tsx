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
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { ApiError, NetworkError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { MeetingStatus } from "@/api/types";
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

  it("asks for the link with the token's uid, so the Event screens learn its kind", async () => {
    // Agreement 8.6: the token page sends its token's UID, and 11.9 carries the
    // token's kind in the link, so the passport knows it before the first tap.
    const create = vi.spyOn(api, "createLoginLink");
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, "04:a1:b2:c3:d4:e5:f6");

    await userEvent.click(await screen.findByRole("button", { name: "Open Capstone Showcase" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith("showcase", OWNED_BY_PARTICIPANT));
  });

  it("shows no event button on a token nobody has claimed", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, UNCLAIMED);

    expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("shows no event button on a token someone else holds, unless the tap's answer gives one", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    api.mock.setMeetingStatus("same_kind");
    renderAs(api, OWNED_BY_SOMEONE_ELSE);

    expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
    expect(await screen.findByText(/same group/)).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Token" })).toBeInTheDocument();
  });

  it("calls a token someone else holds a token, not yours", async () => {
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderAs(api, OWNED_BY_SOMEONE_ELSE);

    expect(await screen.findByText(/This token belongs to/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Token" })).toBeInTheDocument();
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

  describe("half a connection, when the token is someone else's", () => {
    /** Section 13's sentence for each status an Event Service can answer with (11.10). */
    const SENTENCES: Record<MeetingStatus, string> = {
      answers_needed:
        "You both need to finish your names and answers in the event before connecting.",
      waiting: "Request sent. Ask them to open their dashboard and accept.",
      connected: "You're connected!",
      already_connected: "You're already connected.",
      same_kind: "You're in the same group. Find someone from another group.",
      // Connecting across groups (BAC-140, approved for the agreement's next version).
      same_group: "You're in the same group. Find someone from another group.",
      // Section 13 (FRO-146): the event's button joins the participant, so the tapper is told
      // to open the event. The dashboard keeps its own sentence, since it answers a request.
      no_group:
        "You both need to be in a group to connect. Open the event to join a group, then tap again.",
      unavailable: "Couldn't connect. Tap their token again.",
    };
    const STATUSES = Object.keys(SENTENCES) as MeetingStatus[];

    it("sends the half by itself, with the token's normalised UID", async () => {
      // Agreement 8.8: no button and no press. The lookup answering someone_else is the
      // signal.
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, "04:c3:d5:f7:09:12");

      expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
      // The sentence is the answer showing, so the re-render it caused is behind us.
      expect(await screen.findByText(SENTENCES.waiting)).toBeInTheDocument();
      expect(meet).toHaveBeenCalledTimes(1);
      expect(meet).toHaveBeenCalledWith(OWNED_BY_SOMEONE_ELSE);
    });

    it.each(STATUSES)("says what %s means in section 13's words", async (status) => {
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      api.mock.setMeetingStatus(status);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByText(SENTENCES[status])).toBeInTheDocument();
      // The owner sentence stays above it, which is where section 13 puts the answer.
      expect(screen.getByText("This token belongs to someone else.")).toBeInTheDocument();
    });

    it.each(["answers_needed", "waiting", "connected", "already_connected", "no_group"] as const)(
      "offers the event's button on %s, so the dashboard can take it from there",
      async (status) => {
        // Section 13: the button opens the event's screens through a login link (8.6).
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingStatus(status);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(
          await screen.findByRole("button", { name: "Open Capstone Showcase" }),
        ).toBeInTheDocument();
      },
    );

    it("opens the event through a login link on no_group, so the tapper can join", async () => {
      // Section 13: the button opens the event's screens through a login link (8.6), which
      // joins the participant on arrival and places a latecomer (FRO-118, FRO-146).
      const create = vi.spyOn(api, "createLoginLink");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      api.mock.setMeetingStatus("no_group");
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      await userEvent.click(await screen.findByRole("button", { name: "Open Capstone Showcase" }));

      await waitFor(() => expect(create).toHaveBeenCalledWith("showcase", OWNED_BY_SOMEONE_ELSE));
      await waitFor(() =>
        expect(location.assign).toHaveBeenCalledWith("http://localhost:5173/#login=mock"),
      );
    });

    it.each(["same_kind", "same_group", "unavailable"] as const)(
      "offers no event button on %s, which has nothing to open yet",
      async (status) => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingStatus(status);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(SENTENCES[status])).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
      },
    );

    describe("the owner's name", () => {
      const NAMED = "This token belongs to Sam.";
      const SWAP_BACK = "If you're carrying this token, it isn't yours. Swap it back with Sam.";
      const UNNAMED = "This token belongs to someone else.";
      const ANSWERS_WITH_A_NAME = STATUSES.filter((status) => status !== "unavailable");

      it.each(ANSWERS_WITH_A_NAME)("shows both sentences with the name on %s", async (status) => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingStatus(status);
        api.mock.setMeetingOwnerName("Sam");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(NAMED)).toBeInTheDocument();
        expect(screen.getByText(SWAP_BACK)).toBeInTheDocument();
        expect(screen.queryByText(UNNAMED)).not.toBeInTheDocument();
        // What the tap came to stays, under the name.
        expect(screen.getByText(SENTENCES[status])).toBeInTheDocument();
      });

      it("keeps the plain sentence when the owner has no name", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingOwnerName(null);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(SENTENCES.waiting)).toBeInTheDocument();
        expect(screen.getByText(UNNAMED)).toBeInTheDocument();
        expect(screen.queryByText(/Swap it back/)).not.toBeInTheDocument();
      });

      it("keeps the plain sentence and the usual line on unavailable", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingStatus("unavailable");
        api.mock.setMeetingOwnerName("Sam");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(SENTENCES.unavailable)).toBeInTheDocument();
        expect(screen.getByText(UNNAMED)).toBeInTheDocument();
        expect(screen.queryByText(/Swap it back/)).not.toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/Sam/);
      });

      it("takes the name from whichever Event Service gave one", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        vi.spyOn(api, "meetToken").mockResolvedValue([
          { event_id: "other", status: "unavailable", owner_name: null, owner_bio: null },
          { event_id: "showcase", status: "waiting", owner_name: "Sam", owner_bio: null },
        ]);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(NAMED)).toBeInTheDocument();
        expect(screen.getByText(SWAP_BACK)).toBeInTheDocument();
      });

      it("shows the owner's bio under their name and above the swap sentence (BAC-151)", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingOwnerName("Sam");
        api.mock.setMeetingOwnerBio("Building a robot arm");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        const bio = await screen.findByText("Building a robot arm");
        const named = screen.getByText(NAMED);
        const swap = screen.getByText(SWAP_BACK);
        expect(named.compareDocumentPosition(bio)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(bio.compareDocumentPosition(swap)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        // What the tap came to stays, under all of it.
        expect(screen.getByText(SENTENCES.waiting)).toBeInTheDocument();
      });

      it("shows only the name for an owner with no bio, with no empty line (BAC-151)", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingOwnerName("Sam");
        api.mock.setMeetingOwnerBio(null);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        const named = await screen.findByText(NAMED);
        expect(named.parentElement?.querySelectorAll("p")).toHaveLength(2);
      });

      it("shows the bio of an owner with no name under the plain sentence (BAC-151)", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingOwnerName(null);
        api.mock.setMeetingOwnerBio("Building a robot arm");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText("Building a robot arm")).toBeInTheDocument();
        expect(screen.getByText(UNNAMED)).toBeInTheDocument();
        expect(screen.queryByText(/Swap it back/)).not.toBeInTheDocument();
      });

      it("takes the bio from the Event Service that gave the name (BAC-151)", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        vi.spyOn(api, "meetToken").mockResolvedValue([
          { event_id: "other", status: "waiting", owner_name: null, owner_bio: "Another event's" },
          { event_id: "showcase", status: "waiting", owner_name: "Sam", owner_bio: "This event's" },
        ]);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText("This event's")).toBeInTheDocument();
        expect(screen.queryByText("Another event's")).not.toBeInTheDocument();
      });

      it("shows no bio on unavailable (BAC-151)", async () => {
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        api.mock.setMeetingStatus("unavailable");
        api.mock.setMeetingOwnerBio("Building a robot arm");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(SENTENCES.unavailable)).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/robot arm/);
      });

      it("shows an admin no name, since their page sends no half", async () => {
        const meet = vi.spyOn(api, "meetToken");
        api.mock.setSession(SEEDED_ADMIN_ID);
        api.mock.setMeetingOwnerName("Sam");
        api.mock.setMeetingOwnerBio("Building a robot arm");
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(UNNAMED)).toBeInTheDocument();
        expect(meet).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toMatch(/Sam|robot arm/);
      });
    });

    it("shows nothing new when no Event Service takes meetings", async () => {
      // 8.8: "empty when none takes them", so the owner sentence is the whole answer.
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      api.mock.data.event_services = api.mock.data.event_services.map((service) => ({
        ...service,
        takes_meetings: false,
      }));
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
      await waitFor(() => expect(meet).toHaveBeenCalledTimes(1));
      for (const sentence of Object.values(SENTENCES)) {
        expect(screen.queryByText(sentence)).not.toBeInTheDocument();
      }
      expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
    });

    it("sends no half for a GeekyKey admin, who may be holding a lost token", async () => {
      // 8.8 skips the call for an admin: Release is the action on this screen for them.
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_ADMIN_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByRole("button", { name: "Release" })).toBeInTheDocument();
      expect(screen.getByText("This token belongs to someone else.")).toBeInTheDocument();
      expect(meet).not.toHaveBeenCalled();
      expect(screen.queryByText(SENTENCES.waiting)).not.toBeInTheDocument();
    });

    describe("how the page was loaded (BAC-149)", () => {
      /** Makes the browser report this kind of page load, as Navigation Timing does. */
      function loadedBy(type: NavigationTimingType) {
        vi.stubGlobal("performance", {
          ...performance,
          now: () => Date.now(),
          getEntriesByType: (entryType: string) => (entryType === "navigation" ? [{ type }] : []),
        });
      }

      afterEach(() => vi.unstubAllGlobals());

      it.each(["reload", "back_forward"] as const)(
        "sends no half on a %s, so a declined request doesn't come back without a tap",
        async (type) => {
          loadedBy(type);
          const meet = vi.spyOn(api, "meetToken");
          api.mock.setSession(SEEDED_PARTICIPANT_ID);
          renderAs(api, OWNED_BY_SOMEONE_ELSE);

          expect(
            await screen.findByText("This token belongs to someone else."),
          ).toBeInTheDocument();
          expect(meet).not.toHaveBeenCalled();
          expect(screen.queryByText(SENTENCES.waiting)).not.toBeInTheDocument();
          expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
        },
      );

      it("sends the half on a navigation, which is what tapping a token opens", async () => {
        loadedBy("navigate");
        const meet = vi.spyOn(api, "meetToken");
        api.mock.setSession(SEEDED_PARTICIPANT_ID);
        renderAs(api, OWNED_BY_SOMEONE_ELSE);

        expect(await screen.findByText(SENTENCES.waiting)).toBeInTheDocument();
        expect(meet).toHaveBeenCalledTimes(1);
      });
    });

    it("sends no half for your own token", async () => {
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_PARTICIPANT);

      expect(await screen.findByText("This is your token.")).toBeInTheDocument();
      expect(meet).not.toHaveBeenCalled();
    });

    it("sends no half for a token nobody has claimed", async () => {
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, UNCLAIMED);

      expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
      expect(meet).not.toHaveBeenCalled();
    });

    it("sends one half when React runs the effect twice, as development does", async () => {
      // StrictMode mounts, unmounts and mounts again, so an effect without the ref would
      // send a second half. 11.10 says that does no harm, but it is still a second read
      // of the claims stand-in against the 20 a minute.
      const meet = vi.spyOn(api, "meetToken");
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      const { Providers } = createTestProviders(api, { session: true });
      render(
        <StrictMode>
          <Providers>
            <TokenPage uid={OWNED_BY_SOMEONE_ELSE} />
          </Providers>
        </StrictMode>,
      );

      expect(await screen.findByText(SENTENCES.waiting)).toBeInTheDocument();
      expect(meet).toHaveBeenCalledTimes(1);
    });

    it("uses agreement 13's wording when it can't reach GeeksHacking, with no retry to press", async () => {
      // Section 13 fixes the token page's sentence for claims_unavailable, and the half
      // has no button: tapping the token again is the retry (8.8).
      vi.spyOn(api, "meetToken").mockRejectedValue(new ApiError(503, "claims_unavailable"));
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't reach GeeksHacking. Try again.",
      );
      // The owner sentence stays, so the screen still says what the token is.
      expect(screen.getByText("This token belongs to someone else.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    });

    it("uses agreement 13's wording when the half is rate limited", async () => {
      vi.spyOn(api, "meetToken").mockRejectedValue(new ApiError(429, "rate_limited"));
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Too many tries. Wait a minute and try again.",
      );
    });

    it("says nothing when the session is gone, because the page is leaving for the login", async () => {
      vi.spyOn(api, "meetToken").mockRejectedValue(new ApiError(401, "unauthenticated"));
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });

    it("looks the token up again when the half finds it is no longer someone else's", async () => {
      // 8.8 answers not_found when the token stopped being someone else's between the
      // lookup and the half. Section 13 sets no sentence for it, so the fresh lookup
      // decides what the page shows: here the token was released, so Claim comes back.
      const getToken = vi.spyOn(api, "getToken");
      vi.spyOn(api, "meetToken").mockImplementation(async () => {
        api.mock.data.tokens = api.mock.data.tokens.filter(
          (token) => token.uid !== OWNED_BY_SOMEONE_ELSE,
        );
        throw new ApiError(404, "not_found");
      });
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByText("Nobody has claimed this token yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
      expect(getToken).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows describeError's sentence for a transport failure", async () => {
      // Nothing in section 13 words a dropped request, so it gets the screens' own
      // sentence rather than nothing at all.
      vi.spyOn(api, "meetToken").mockRejectedValue(new NetworkError());
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not reach the server. Check the Wi-Fi and try again.",
      );
    });

    it("shows the lookup's own error if the re-lookup fails, rather than a blank sentence", async () => {
      // 8.8's not_found has the page ask the lookup again. If that fails too, the page is
      // back to TokenError, which words it from section 13 and offers a retry.
      vi.spyOn(api, "meetToken").mockImplementation(async () => {
        api.mock.data.tokens = api.mock.data.tokens.filter(
          (token) => token.uid !== OWNED_BY_SOMEONE_ELSE,
        );
        api.mock.failNext("rate_limited");
        throw new ApiError(404, "not_found");
      });
      api.mock.setSession(SEEDED_PARTICIPANT_ID);
      renderAs(api, OWNED_BY_SOMEONE_ELSE);

      expect(
        await screen.findByText("Too many tries. Wait a minute and try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });
  });
});
