import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { type MockConnectionRequest, SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import type { Connection } from "@/api/types";
import { ConnectionsScreen } from "@/features/passport/connections-screen";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

/** The screens are only ever shown inside RequireSession, so the test waits for a session too. */
function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
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

/** A guest with the connections and requests a test gives them, and no others from the fixtures. */
function setUp(connections: Connection[], requests: MockConnectionRequest[] = []) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = guestOf(api);
  guest.connections = connections;
  guest.connection_requests = requests;
  return api;
}

/**
 * The screen at `/`, inside the router the tabs need. `/connections` is a marker, so a press on
 * Home's "See all" can be seen arriving.
 */
function renderScreen(api: MockApiClient, screen: ReactNode = <ConnectionsScreen />) {
  const { Providers } = createTestProviders(api, { session: true });
  const root = createRootRoute({
    component: () => (
      <SignedIn>
        <Outlet />
      </SignedIn>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => screen });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/connections",
    component: () => <p>Connections tab</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, tab]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <Providers>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Providers>,
  );
  return { user: userEvent.setup() };
}

describe("the Connections tab (FRO-182)", () => {
  it("lists the requests first, then every connection as a card", async () => {
    renderScreen(
      setUp(
        [connection(3, { display_name: "Mei Lin" }), connection(9, { display_name: "Farhan" })],
        [request("request-1", "Wei Lin", { bio: "Sensors and sourdough" })],
      ),
    );

    const requests = await screen.findByRole("region", { name: "Connection requests" });
    expect(within(requests).getByText("Wei Lin wants to connect.")).toBeInTheDocument();
    expect(within(requests).getByText("Sensors and sourdough")).toBeInTheDocument();
    expect(within(requests).getByRole("button", { name: "Accept" })).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Connections" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Mei Lin");
    expect(cards[1]).toHaveTextContent("Farhan");
    // The requests still need an answer, so they come before everyone met.
    expect(requests.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the bio as the card's main text, and takes no line for a field they don't have", async () => {
    renderScreen(
      setUp([
        connection(3, { display_name: "Mei Lin", bio: "Sourdough", contact_line: "@meilin" }),
        connection(9, { display_name: "Farhan" }),
      ]),
    );

    const list = await screen.findByRole("list", { name: "Connections" });
    const [first, second] = within(list).getAllByRole("listitem");
    if (!first || !second) throw new Error("Expected two connection cards");
    const bio = within(first).getByText("Sourdough");
    expect(bio).not.toHaveClass("text-sm");
    expect(bio).not.toHaveClass("text-muted-foreground");
    expect(first).toHaveTextContent("Contact: @meilin");
    expect(second).not.toHaveTextContent("Contact:");
    expect(second.querySelector("p:empty")).toBeNull();
  });

  it("shows Guest for someone with no name", async () => {
    renderScreen(setUp([connection(3, { display_name: null })]));

    const list = await screen.findByRole("list", { name: "Connections" });
    expect(within(list).getByRole("listitem")).toHaveTextContent("Guest");
  });

  it("shows every connection where Home shows three", async () => {
    const api = setUp([
      connection(1, { match: 80 }),
      connection(2, { match: 70 }),
      connection(3, { match: 60 }),
      connection(4, { match: 50 }),
    ]);
    renderScreen(api);

    const list = await screen.findByRole("list", { name: "Connections" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("says what to do while there are none", async () => {
    renderScreen(setUp([]));

    expect(await screen.findByText(/No connections yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Connections" })).not.toBeInTheDocument();
  });

  it("says nothing about connecting in an event with no answers game", async () => {
    const api = setUp([]);
    api.mock.data.questions = null;
    renderScreen(api);

    await screen.findByRole("heading", { name: "Connections" });
    expect(screen.queryByText(/No connections yet/)).not.toBeInTheDocument();
  });
});

describe("Home's list after the tab (FRO-182)", () => {
  it("shows the newest three, and See all opens the tab", async () => {
    const api = setUp([
      connection(1, { display_name: "First", match: 80 }),
      connection(2, { display_name: "Second", match: 70 }),
      connection(3, { display_name: "Third", match: 60 }),
      connection(4, { display_name: "Fourth", match: 50 }),
    ]);
    const { user } = renderScreen(api, <DashboardScreen />);

    const list = await screen.findByRole("list", { name: "Connections" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("First");
    expect(rows[2]).toHaveTextContent("Third");
    expect(list).not.toHaveTextContent("Fourth");

    const seeAll = screen.getByRole("link", { name: "See all" });
    expect(seeAll).toHaveAttribute("href", "/connections");
    await user.click(seeAll);
    expect(await screen.findByText("Connections tab")).toBeInTheDocument();
  });

  it("has no See all while three or fewer are there", async () => {
    renderScreen(setUp([connection(1), connection(2), connection(3)]), <DashboardScreen />);

    await screen.findByRole("list", { name: "Connections" });
    expect(screen.queryByRole("link", { name: "See all" })).not.toBeInTheDocument();
  });
});
