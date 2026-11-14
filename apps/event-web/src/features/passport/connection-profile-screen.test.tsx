import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import type { Connection } from "@/api/types";
import { ConnectionProfileScreen } from "@/features/passport/connection-profile-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

/** The screens are only ever shown inside RequireSession, so the test waits for a session too. */
function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
}

function connection(minutesAgo: number, fields: Partial<Connection> = {}): Connection {
  const connectedAt = Date.now() - minutesAgo * 60_000;
  return {
    id: "connection-1",
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

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

function setUp(connections: Connection[], answers: Record<string, string> = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = guestOf(api);
  guest.connections = connections;
  guest.answers = { ...guest.answers, ...answers };
  return api;
}

/** The profile at `/`, with `/connections` a marker, so the back link can be seen arriving. */
function renderProfile(api: MockApiClient, id = "connection-1") {
  const { Providers } = createTestProviders(api, { session: true });
  const root = createRootRoute({
    component: () => (
      <SignedIn>
        <Outlet />
      </SignedIn>
    ),
  });
  const profile = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <ConnectionProfileScreen id={id} />,
  });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/connections",
    component: () => <p>Connections tab</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([profile, tab]),
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

describe("the person's profile (FRO-183)", () => {
  it("shows their name, bio, contact line and match", async () => {
    renderProfile(
      setUp([
        connection(3, {
          display_name: "Mei Lin",
          bio: "Sourdough and sensors",
          contact_line: "@meilin",
          match: 67,
        }),
      ]),
    );

    expect(await screen.findByRole("heading", { name: "Mei Lin" })).toBeInTheDocument();
    expect(screen.getByText("Sourdough and sensors")).toBeInTheDocument();
    expect(screen.getByText("Contact: @meilin")).toBeInTheDocument();
    expect(screen.getByText("67% match")).toBeInTheDocument();
  });

  it("takes no line for a field they don't have, and says Guest for no name", async () => {
    renderProfile(setUp([connection(3, { display_name: null, match: null })]));

    expect(await screen.findByRole("heading", { name: "Guest" })).toBeInTheDocument();
    expect(screen.queryByText(/Contact:/)).not.toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows what the two share without a press", async () => {
    renderProfile(setUp([connection(3, { shared: ["team_role"] })], { team_role: "ideas" }));

    expect(await screen.findByText("What you share")).toBeInTheDocument();
    expect(
      screen.getByText("Your team is making something new. Which part would you most enjoy?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Coming up with ideas")).toBeInTheDocument();
  });

  it("says when the two share nothing", async () => {
    renderProfile(setUp([connection(3, { shared: [] })]));

    expect(await screen.findByText("You don't share any answers.")).toBeInTheDocument();
  });

  it("shows the dice result, the word and when they connected", async () => {
    renderProfile(
      setUp([
        connection(3, {
          dice: { your_roll: 5, their_roll: 2, result: "win" },
          word: { text: "sourdough", already_had: false },
        }),
      ]),
    );

    expect(await screen.findByText("You rolled 5. They rolled 2.")).toBeInTheDocument();
    expect(screen.getByText("You win!")).toBeInTheDocument();
    expect(screen.getByText("sourdough")).toBeInTheDocument();
    expect(screen.getByText(/^Today, /)).toBeInTheDocument();
  });

  it("offers a reaction test still to play", async () => {
    const connectedAt = Date.now() - 30_000;
    renderProfile(
      setUp([
        connection(0.5, {
          reaction: {
            play_by: new Date(connectedAt + 120_000).toISOString(),
            your_play: "not_played",
            your_ms: null,
            their_play: "not_played",
            their_ms: null,
            result: null,
          },
        }),
      ]),
    );

    expect(await screen.findByText("Reaction test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I'm ready" })).toBeInTheDocument();
  });

  it("copies the contact line and says Copied", async () => {
    const { user } = renderProfile(setUp([connection(3, { contact_line: "@meilin" })]));

    await user.click(await screen.findByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe("@meilin");
  });

  it("takes the back link to the Connections tab", async () => {
    const { user } = renderProfile(setUp([connection(3)]));

    await user.click(await screen.findByRole("link", { name: "Back to Connections" }));

    expect(await screen.findByText("Connections tab")).toBeInTheDocument();
  });

  it("shows not found for an id that isn't in /me, with the way back", async () => {
    renderProfile(setUp([connection(3)]), "another-connection");

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Connections" })).toHaveAttribute(
      "href",
      "/connections",
    );
  });
});
