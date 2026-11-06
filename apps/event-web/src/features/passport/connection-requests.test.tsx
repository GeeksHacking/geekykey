import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { type MockConnectionRequest, SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const SAME_GROUP = "You're in the same group. Find someone from another group.";
const NO_GROUP = "You both need to be in a group to connect. Ask an organiser.";

/** The screens are only ever shown inside RequireSession, so the test waits for a session too. */
function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
}

function request(id: string, name: string, fields: Partial<MockConnectionRequest> = {}) {
  return {
    id,
    display_name: name,
    bio: null,
    requested_at: new Date(Date.now() - 30_000).toISOString(),
    ...fields,
  };
}

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

function setUp(requests: MockConnectionRequest[]) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = guestOf(api);
  guest.connection_requests = requests;
  guest.has_name = true;
  return api;
}

function renderScreen(api: MockApiClient) {
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <ThemeProvider>
        <SignedIn>
          <DashboardScreen />
        </SignedIn>
      </ThemeProvider>
    </Providers>,
  );
  /** What the 10-second poll of /me does. */
  const poll = () =>
    act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      // Query tells the screens on a timer, so give the render it causes time to land.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  return { poll, user: userEvent.setup() };
}

/** The dashboard's requests section, which isn't there while it has nothing to say. */
const requestsSection = () => screen.queryByRole("region", { name: "Connection requests" });

/** The row for the person asking, once it has rendered. */
async function rowFor(name: string) {
  const text = await screen.findByText(`${name} wants to connect.`);
  const row = text.closest("li");
  if (!row) throw new Error("The request isn't in a list item");
  return within(row);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("connection requests on the dashboard (BAC-149)", () => {
  it("shows nothing while no request waits", async () => {
    renderScreen(setUp([]));
    await screen.findByRole("heading", { name: "Latest stamps" });
    expect(requestsSection()).toBeNull();
  });

  it("shows a request at the next poll, with the name and both buttons", async () => {
    const api = setUp([]);
    const { poll } = renderScreen(api);
    await screen.findByRole("heading", { name: "Latest stamps" });

    guestOf(api).connection_requests = [request("r-1", "Mei Lin")];
    await poll();

    const row = await rowFor("Mei Lin");
    expect(row.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("shows the tapper's bio under their name, so the user sees who's asking (BAC-151)", async () => {
    renderScreen(setUp([request("r-1", "Mei Lin", { bio: "Sensors and sourdough" })]));

    const row = await rowFor("Mei Lin");
    expect(row.getByText("Sensors and sourdough")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("shows only the name for someone with no bio, with no empty line (BAC-151)", async () => {
    renderScreen(setUp([request("r-1", "Mei Lin")]));

    const text = await screen.findByText("Mei Lin wants to connect.");
    expect(text.parentElement?.querySelectorAll("p")).toHaveLength(1);
  });

  it("accepting removes the request and shows the reveal", async () => {
    const { user } = renderScreen(setUp([request("r-1", "Mei Lin")]));
    const row = await rowFor("Mei Lin");

    await user.click(row.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("status", { name: "New connection" })).toBeInTheDocument();
    expect(screen.queryByText("Mei Lin wants to connect.")).not.toBeInTheDocument();
  });

  it("declining removes the request, makes no connection and says nothing", async () => {
    const api = setUp([request("r-1", "Mei Lin"), request("r-2", "Daniel Ong")]);
    const { user } = renderScreen(api);
    const row = await rowFor("Mei Lin");

    await user.click(row.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(screen.queryByText("Mei Lin wants to connect.")).not.toBeInTheDocument(),
    );
    expect(await rowFor("Daniel Ong")).toBeTruthy();
    expect(requestsSection()?.querySelector("[role=alert], [role=status]")).toBeNull();
    expect(screen.queryByRole("status", { name: "New connection" })).not.toBeInTheDocument();
  });

  it.each([
    ["same_kind", SAME_GROUP],
    ["same_group", SAME_GROUP],
    ["no_group", NO_GROUP],
  ] as const)("accepting says why when the service answers %s", async (status, sentence) => {
    const api = setUp([request("r-1", "Mei Lin", { accept_answer: status })]);
    const { user } = renderScreen(api);
    const row = await rowFor("Mei Lin");

    await user.click(row.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText("Mei Lin wants to connect.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "New connection" })).not.toBeInTheDocument();

    await user.click(within(requestsSection()!).getByRole("button", { name: "Dismiss" }));
    expect(requestsSection()).toBeNull();
  });

  it("accepting a request already gone says nothing, and the next read takes it away", async () => {
    const api = setUp([request("r-1", "Mei Lin")]);
    const { user } = renderScreen(api);
    const row = await rowFor("Mei Lin");

    guestOf(api).connection_requests = [];
    await user.click(row.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(requestsSection()).toBeNull());
  });

  it("keeps the request and shows the error when the answer doesn't get through", async () => {
    const api = setUp([request("r-1", "Mei Lin")]);
    const { user } = renderScreen(api);
    const row = await rowFor("Mei Lin");

    vi.spyOn(api, "acceptConnectionRequest").mockRejectedValue(new ApiError(429, "rate_limited"));
    await user.click(row.getByRole("button", { name: "Accept" }));

    const section = within(requestsSection()!);
    expect(await section.findByRole("alert")).toHaveTextContent(
      "Too many requests. Wait a minute and try again.",
    );
    expect(await rowFor("Mei Lin")).toBeTruthy();
  });

  it("presses once: both buttons are off until the answer is back", async () => {
    const api = setUp([request("r-1", "Mei Lin")]);
    let finish = () => {};
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const accept = api.acceptConnectionRequest.bind(api);
    vi.spyOn(api, "acceptConnectionRequest").mockImplementation(async (id) => {
      await blocked;
      return accept(id);
    });
    const { user } = renderScreen(api);
    const row = await rowFor("Mei Lin");

    await user.click(row.getByRole("button", { name: "Accept" }));

    expect(row.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(row.getByRole("button", { name: "Decline" })).toBeDisabled();
    // Only the button pressed says it's working.
    expect(
      row.getByRole("button", { name: "Accept" }).querySelector(".animate-spin"),
    ).not.toBeNull();
    expect(row.getByRole("button", { name: "Decline" }).querySelector(".animate-spin")).toBeNull();
    await act(async () => {
      finish();
      await blocked;
    });
    expect(await screen.findByRole("status", { name: "New connection" })).toBeInTheDocument();
  });
});

it("an unfinished sender's request stays available after Accept and can be retried", async () => {
  const api = setUp([request("r-1", "Mei Lin", { accept_answer: "answers_needed" })]);
  const { user } = renderScreen(api);
  await user.click((await rowFor("Mei Lin")).getByRole("button", { name: "Accept" }));
  expect(
    await screen.findByText(
      "You both need to finish your names and answers in the event before connecting.",
    ),
  ).toBeInTheDocument();
  expect(await rowFor("Mei Lin")).toBeTruthy();
  expect(screen.queryByRole("status", { name: "New connection" })).not.toBeInTheDocument();
  guestOf(api).connection_requests![0]!.accept_answer = "connected";
  await user.click((await rowFor("Mei Lin")).getByRole("button", { name: "Accept" }));
  expect(await screen.findByRole("status", { name: "New connection" })).toBeInTheDocument();
});
