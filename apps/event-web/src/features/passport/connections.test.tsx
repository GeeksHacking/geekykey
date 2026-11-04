import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { Connection } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { PassportScreen } from "@/features/passport/passport-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));
vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const TALK = "Talk to find out which answers you share.";
const SHOW = "Show what we share";

/** The screens are only ever shown inside RequireSession, so the test waits for a session too. */
function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
}

/** A guest with the answers and connections a test gives them, and no others from the fixtures. */
function setUp(connections: Connection[], answers: Record<string, string> = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = guestOf(api);
  guest.connections = connections;
  guest.answers = answers;
  return api;
}

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

function renderScreen(api: MockApiClient, screenUnderTest: ReactNode = <PassportScreen />) {
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  const view = render(
    <Providers>
      <ThemeProvider>
        <SignedIn>{screenUnderTest}</SignedIn>
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
  return { poll, user: userEvent.setup(), ...view };
}

/** A connection `minutesAgo` old, whose `shared` has arrived unless it is under 2 minutes old. */
function connection(minutesAgo: number, fields: Partial<Connection> = {}): Connection {
  const connectedAt = Date.now() - minutesAgo * 60_000;
  return {
    connected_at: new Date(connectedAt).toISOString(),
    kind: "B",
    match: 60,
    shared: [],
    shared_at: new Date(connectedAt + 120_000).toISOString(),
    ...fields,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("the reveal (agreement 0.13 draft, section 13)", () => {
  it("shows the match when a poll brings a new connection", async () => {
    const api = setUp([]);
    const { poll } = renderScreen(api);
    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByText(TALK)).not.toBeInTheDocument();

    guestOf(api).connections = [connection(0, { match: 67 })];
    await poll();

    expect(screen.getByText("You're a 67% match!")).toBeInTheDocument();
    expect(screen.getByText(TALK)).toBeInTheDocument();
  });

  it("says they're connected, with nothing to talk about, when `match` is null", async () => {
    renderScreen(setUp([connection(0, { match: null })]));

    expect(await screen.findByText("You're connected!")).toBeInTheDocument();
    expect(screen.queryByText(/% match!/)).not.toBeInTheDocument();
    expect(screen.queryByText(TALK)).not.toBeInTheDocument();
  });

  it("shows 0% as a match, not as no match", async () => {
    renderScreen(setUp([connection(0, { match: 0 })]));

    expect(await screen.findByText("You're a 0% match!")).toBeInTheDocument();
  });

  it("shows a connection the page arrived with, because the token page's button leads here", async () => {
    renderScreen(setUp([connection(0, { match: 67 })]));

    expect(await screen.findByText("You're a 67% match!")).toBeInTheDocument();
  });

  it("shows the newest of several new connections", async () => {
    renderScreen(setUp([connection(1, { match: 80 }), connection(9, { match: 20 })]));

    expect(await screen.findByText("You're a 80% match!")).toBeInTheDocument();
    expect(screen.queryByText("You're a 20% match!")).not.toBeInTheDocument();
  });

  it("stays dismissed after a reload, and comes back for the next connection", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("You're a 67% match!");

    await first.user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("You're a 67% match!")).not.toBeInTheDocument();

    await first.poll();
    expect(screen.queryByText("You're a 67% match!")).not.toBeInTheDocument();

    first.unmount();
    const second = renderScreen(api);
    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByText("You're a 67% match!")).not.toBeInTheDocument();

    guestOf(api).connections = [connection(0, { match: 33 }), ...(guestOf(api).connections ?? [])];
    await second.poll();
    expect(screen.getByText("You're a 33% match!")).toBeInTheDocument();
  });

  it("stays until it is dismissed, on the next visit too", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("You're a 67% match!");

    first.unmount();
    renderScreen(api, <DashboardScreen />);

    expect(await screen.findByText("You're a 67% match!")).toBeInTheDocument();
  });

  it("is still shown to the next person on a shared phone", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("You're a 67% match!");
    await first.user.click(screen.getByRole("button", { name: "Dismiss" }));
    first.unmount();

    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderScreen(api);

    expect(await screen.findByText("You're a 60% match!")).toBeInTheDocument();
  });

  it("shows on the dashboard, where the token page's login link lands", async () => {
    renderScreen(setUp([connection(0, { match: 67 })]), <DashboardScreen />);

    expect(await screen.findByText("You're a 67% match!")).toBeInTheDocument();
  });
});

describe("the list of connections (agreement 0.13 draft, section 13)", () => {
  it("lists them newest first, each with its match and no names", async () => {
    renderScreen(
      setUp([connection(3, { match: 67 }), connection(9, { match: null }), connection(20)]),
    );

    const list = await screen.findByRole("list", { name: "Connections" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("67% match");
    expect(rows[1]).toHaveTextContent("Connected");
    expect(rows[2]).toHaveTextContent("60% match");
    expect(list).not.toHaveTextContent("Guest");
    expect(list).not.toHaveTextContent(SEEDED_GUEST_ID);
  });

  it("says what to do while there are none, in an event with the answers game", async () => {
    renderScreen(setUp([]));

    expect(await screen.findByText(/No connections yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Connections" })).not.toBeInTheDocument();
  });

  it("isn't there for an event with no answers game and no connections", async () => {
    const api = setUp([]);
    api.mock.data.questions = null;
    renderScreen(api);

    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByRole("heading", { name: "Connections" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No connections yet/)).not.toBeInTheDocument();
  });

  it("is on the dashboard too", async () => {
    renderScreen(setUp([connection(3, { match: 67 })]), <DashboardScreen />);

    expect(await screen.findByRole("list", { name: "Connections" })).toBeInTheDocument();
  });
});

describe("what you share (agreement 0.13 draft, section 13)", () => {
  const answers = { drink: "tea", school: "cca", hours: "night_owl" };

  it("has no button until `shared` arrives, then one that lists it", async () => {
    const api = setUp(
      [
        connection(1, {
          match: 67,
          shared: ["drink", "school"],
          shared_at: "2099-01-01T00:00:00Z",
        }),
      ],
      answers,
    );
    const { poll, user } = renderScreen(api);
    const list = await screen.findByRole("list", { name: "Connections" });
    expect(within(list).queryByRole("button", { name: SHOW })).not.toBeInTheDocument();

    // The Event Service gives `shared` from `shared_at` on, and the next poll brings it.
    const [held] = guestOf(api).connections ?? [];
    if (!held) throw new Error("The guest has no connection");
    held.shared_at = new Date(Date.now() - 1_000).toISOString();
    await poll();

    const button = within(list).getByRole("button", { name: SHOW });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Tea or coffee?")).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    const shared = within(list).getByRole("list", { name: "What you share" });
    expect(
      within(shared)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Tea or coffee?Tea", "Best part of school?CCA"]);
    expect(shared).not.toHaveTextContent("Night owl");

    await user.click(button);
    expect(screen.queryByRole("list", { name: "What you share" })).not.toBeInTheDocument();
  });

  it("says so when the two share nothing", async () => {
    const { user } = renderScreen(setUp([connection(5, { match: 0, shared: [] })], answers));

    await user.click(await screen.findByRole("button", { name: SHOW }));

    expect(screen.getByText("You don't share any answers.")).toBeInTheDocument();
  });

  it("leaves out a question taken off the list since", async () => {
    const { user } = renderScreen(
      setUp([connection(5, { shared: ["drink", "retired"] })], { ...answers, retired: "gone" }),
    );

    await user.click(await screen.findByRole("button", { name: SHOW }));

    expect(
      within(screen.getByRole("list", { name: "What you share" })).getAllByRole("listitem"),
    ).toHaveLength(1);
  });
});
