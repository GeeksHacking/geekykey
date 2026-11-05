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
    display_name: "Mei Lin",
    bio: null,
    contact_line: null,
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
  it.each([
    { your_roll: 1, their_roll: 6, result: "loss" as const, wording: "They win!" },
    { your_roll: 4, their_roll: 4, result: "win" as const, wording: "You both win!" },
  ])("shows $wording with both rolls on the dashboard", async ({ wording, ...dice }) => {
    renderScreen(setUp([connection(0, { dice })]), <DashboardScreen />);
    const reveal = await screen.findByRole("status", { name: "New connection" });
    const list = screen.getByRole("list", { name: "Connections" });
    for (const section of [reveal, list]) {
      expect(within(section).getByText(wording)).toBeInTheDocument();
      expect(section).toHaveTextContent(
        `You rolled ${dice.your_roll}. They rolled ${dice.their_roll}.`,
      );
    }
  });

  it.each([undefined, null])("keeps an older connection visible with dice %s", async (dice) => {
    renderScreen(setUp([connection(0, { dice })]));
    const reveal = await screen.findByRole("status", { name: "New connection" });
    const list = screen.getByRole("list", { name: "Connections" });
    for (const section of [reveal, list]) {
      expect(section).toHaveTextContent("Mei Lin");
      expect(section).toHaveTextContent("60% match");
      expect(within(section).queryByText(/rolled|win!/)).not.toBeInTheDocument();
    }
  });

  it("shows both dice and the result in the reveal and the list, alongside the match", async () => {
    renderScreen(
      setUp([
        connection(0, {
          dice: { your_roll: 6, their_roll: 1, result: "win" },
        }),
      ]),
    );
    const reveal = await screen.findByRole("status", { name: "New connection" });
    const list = screen.getByRole("list", { name: "Connections" });
    for (const section of [reveal, list]) {
      expect(within(section).getByText("You rolled 6. They rolled 1.")).toBeInTheDocument();
      expect(within(section).getByText("You win!")).toBeInTheDocument();
      expect(section).toHaveTextContent("60% match");
    }
  });
  it("shows the match when a poll brings a new connection", async () => {
    const api = setUp([]);
    const { poll } = renderScreen(api);
    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByText(TALK)).not.toBeInTheDocument();

    guestOf(api).connections = [connection(0, { match: 67 })];
    await poll();

    expect(screen.getByText("67% match!")).toBeInTheDocument();
    expect(screen.getByText(TALK)).toBeInTheDocument();
  });

  it("says they're connected, with nothing to talk about, when `match` is null", async () => {
    renderScreen(setUp([connection(0, { match: null })]));

    expect(await screen.findByText("You're connected!")).toBeInTheDocument();
    expect(screen.queryByText(/% match!/)).not.toBeInTheDocument();
    expect(screen.queryByText(TALK)).not.toBeInTheDocument();
  });

  it("shows the other person's name, bio and contact line", async () => {
    renderScreen(
      setUp([
        connection(0, { display_name: "Wei Lin", bio: "Robot arms", contact_line: "@weilin" }),
      ]),
    );

    const reveal = await screen.findByRole("status", { name: "New connection" });
    expect(within(reveal).getByText("Wei Lin")).toBeInTheDocument();
    expect(within(reveal).getByText("Robot arms")).toBeInTheDocument();
    expect(within(reveal).getByText("Contact: @weilin")).toBeInTheDocument();
  });

  it("shows only the name of someone with neither field, and Guest for no name", async () => {
    renderScreen(setUp([connection(0, { display_name: null })]));

    const reveal = await screen.findByRole("status", { name: "New connection" });
    expect(within(reveal).getByText("Guest")).toBeInTheDocument();
    expect(within(reveal).queryByText(/Contact:/)).not.toBeInTheDocument();
    expect(reveal.querySelector("p:empty")).toBeNull();
  });

  it("shows 0% as a match, not as no match", async () => {
    renderScreen(setUp([connection(0, { match: 0 })]));

    expect(await screen.findByText("0% match!")).toBeInTheDocument();
  });

  it("shows a connection the page arrived with, because the token page's button leads here", async () => {
    renderScreen(setUp([connection(0, { match: 67 })]));

    expect(await screen.findByText("67% match!")).toBeInTheDocument();
  });

  it("shows the newest of several new connections", async () => {
    renderScreen(setUp([connection(1, { match: 80 }), connection(9, { match: 20 })]));

    expect(await screen.findByText("80% match!")).toBeInTheDocument();
    expect(screen.queryByText("20% match!")).not.toBeInTheDocument();
  });

  it("stays dismissed after a reload, and comes back for the next connection", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("67% match!");

    await first.user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("67% match!")).not.toBeInTheDocument();

    await first.poll();
    expect(screen.queryByText("67% match!")).not.toBeInTheDocument();

    first.unmount();
    const second = renderScreen(api);
    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByText("67% match!")).not.toBeInTheDocument();

    guestOf(api).connections = [connection(0, { match: 33 }), ...(guestOf(api).connections ?? [])];
    await second.poll();
    expect(screen.getByText("33% match!")).toBeInTheDocument();
  });

  it("stays until it is dismissed, on the next visit too", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("67% match!");

    first.unmount();
    renderScreen(api, <DashboardScreen />);

    expect(await screen.findByText("67% match!")).toBeInTheDocument();
  });

  it("is still shown to the next person on a shared phone", async () => {
    const api = setUp([connection(5, { match: 67 })]);
    const first = renderScreen(api);
    await screen.findByText("67% match!");
    await first.user.click(screen.getByRole("button", { name: "Dismiss" }));
    first.unmount();

    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    renderScreen(api);

    expect(await screen.findByText("60% match!")).toBeInTheDocument();
  });

  it("shows on the dashboard, where the token page's login link lands", async () => {
    renderScreen(setUp([connection(0, { match: 67 })]), <DashboardScreen />);

    expect(await screen.findByText("67% match!")).toBeInTheDocument();
  });
});

describe("the list of connections (agreement 0.13 draft, section 13)", () => {
  it("lists them newest first, each with the other person's name above its match", async () => {
    renderScreen(
      setUp([
        connection(3, { display_name: "Mei Lin", match: 67 }),
        connection(9, { display_name: "Farhan", match: null }),
        connection(20, { display_name: "Wei" }),
      ]),
    );

    const list = await screen.findByRole("list", { name: "Connections" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/Mei Lin.*67% match/);
    expect(rows[1]).toHaveTextContent(/Farhan.*Connected/);
    expect(rows[2]).toHaveTextContent(/Wei.*60% match/);
    expect(list).not.toHaveTextContent(SEEDED_GUEST_ID);
  });

  it("shows the names on the dashboard too", async () => {
    renderScreen(setUp([connection(3, { display_name: "Mei Lin" })]), <DashboardScreen />);

    const list = await screen.findByRole("list", { name: "Connections" });
    expect(within(list).getByRole("listitem")).toHaveTextContent("Mei Lin");
  });

  it("shows Guest for someone who has never logged in, or has no name of their own", async () => {
    renderScreen(
      setUp([connection(3, { display_name: null }), connection(9, { display_name: "Guest" })]),
    );

    const list = await screen.findByRole("list", { name: "Connections" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Guest");
    expect(rows[1]).toHaveTextContent("Guest");
  });

  it("shows a name changed after connecting at the next poll, and keeps the row's panel open", async () => {
    const held = connection(9, { display_name: "Guest", shared: ["drink"] });
    const api = setUp([held], { drink: "tea" });
    const { poll, user } = renderScreen(api);
    await user.click(await screen.findByRole("button", { name: SHOW }));

    held.display_name = "Mei Lin";
    await poll();

    const list = screen.getByRole("list", { name: "Connections" });
    expect(list).toHaveTextContent("Mei Lin");
    expect(list).not.toHaveTextContent("Guest");
    expect(screen.getByRole("list", { name: "What you share" })).toBeInTheDocument();
  });

  it("shows each person's bio and contact line under their name", async () => {
    renderScreen(
      setUp([
        connection(3, { display_name: "Mei Lin", bio: "Sourdough", contact_line: "@meilin" }),
        connection(9, { display_name: "Farhan", bio: "Sensors" }),
        connection(20, { display_name: "Wei", contact_line: "wei@example.com" }),
      ]),
    );

    const list = await screen.findByRole("list", { name: "Connections" });
    const [first, second, third] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent(/Mei Lin.*Sourdough.*Contact: @meilin.*match/);
    expect(second).toHaveTextContent(/Farhan.*Sensors/);
    expect(second).not.toHaveTextContent("Contact:");
    expect(third).toHaveTextContent(/Wei.*Contact: wei@example\.com/);
  });

  it("gives someone with neither field no empty line", async () => {
    renderScreen(setUp([connection(3, { display_name: "Mei Lin" })]));

    const list = await screen.findByRole("list", { name: "Connections" });
    expect(list).not.toHaveTextContent("Contact:");
    expect(list.querySelector("p:empty")).toBeNull();
  });

  it("shows an edit at the next poll, hides what they clear, and keeps the match", async () => {
    const api = setUp([connection(3, { bio: "Old bio", contact_line: "@old", match: 67 })]);
    const { poll } = renderScreen(api);
    const list = await screen.findByRole("list", { name: "Connections" });
    expect(list).toHaveTextContent("Contact: @old");

    guestOf(api).connections = [connection(3, { bio: "New bio", contact_line: "@new", match: 67 })];
    await poll();
    expect(list).toHaveTextContent(/New bio.*Contact: @new.*67% match/);

    guestOf(api).connections = [connection(3, { bio: "New bio", match: 67 })];
    await poll();
    expect(list).toHaveTextContent("New bio");
    expect(list).not.toHaveTextContent("Contact:");
  });

  it("keeps two connections with one timestamp apart", async () => {
    const at = "2026-11-12T08:12:30.000Z";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderScreen(
        setUp([
          {
            connected_at: at,
            display_name: "Mei Lin",
            bio: null,
            contact_line: null,
            kind: "B",
            match: 60,
            shared: [],
            shared_at: at,
          },
          {
            connected_at: at,
            display_name: "Mei Lin",
            bio: null,
            contact_line: null,
            kind: "B",
            match: 70,
            shared: [],
            shared_at: at,
          },
        ]),
      );

      const list = await screen.findByRole("list", { name: "Connections" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(errors.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    } finally {
      errors.mockRestore();
    }
  });

  it("lists a connection made across groups, which has no kind (BAC-140)", async () => {
    renderScreen(setUp([connection(3, { kind: null, match: null })]));

    const list = await screen.findByRole("list", { name: "Connections" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("Connected");
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
    expect(within(list).queryByRole("list", { name: "What you share" })).not.toBeInTheDocument();

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
