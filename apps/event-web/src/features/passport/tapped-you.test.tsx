import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { PassportScreen } from "@/features/passport/passport-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));
vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const LINE = "Someone tapped your token. Tap theirs back to connect.";

/** The screens are only ever shown inside RequireSession, so the test waits for a session too. */
function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
}

function setUp(tappedYou: number) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  guest.tapped_you = tappedYou;
  return api;
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
  return { poll, ...view };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("the tap-back prompt (FRO-116)", () => {
  it("isn't there when nobody is waiting", async () => {
    renderScreen(setUp(0));

    await screen.findByRole("list", { name: "Stamps" });
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("shows the exact line while someone is waiting", async () => {
    renderScreen(setUp(1));

    expect(await screen.findByText(LINE)).toBeInTheDocument();
  });

  it("shows the same singular line for more than one person", async () => {
    renderScreen(setUp(2));

    expect(await screen.findByText(LINE)).toBeInTheDocument();
  });

  it("goes when a poll says nobody is waiting any more", async () => {
    const api = setUp(1);
    const { poll } = renderScreen(api);
    await screen.findByText(LINE);

    const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
    if (!guest) throw new Error("The fixtures have no guest");
    guest.tapped_you = 0;
    await poll();

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("shows on the first read, because someone may have tapped while the user was away", async () => {
    renderScreen(setUp(1));

    expect(
      await screen.findByRole("status", { name: "Someone tapped your token" }),
    ).toBeInTheDocument();
  });

  it("isn't on the dashboard, which the ticket leaves to the passport", async () => {
    renderScreen(setUp(1), <DashboardScreen />);

    await screen.findByRole("heading", { name: "Latest stamps" });
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });
});
