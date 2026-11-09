import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import type { User } from "@/api/types";
import { ParticipantShell } from "@/components/layout/participant-shell";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const user = { id: "user-1", display_name: "Alex Tan", role: "participant" } as User;

async function renderShell(connectionRequests: number, showNavigation = true) {
  const rootRoute = createRootRoute({
    component: () => (
      <ThemeProvider>
        <ParticipantShell
          user={user}
          onSignOut={() => {}}
          connectionRequests={connectionRequests}
          showNavigation={showNavigation}
        >
          <p>Screen</p>
        </ParticipantShell>
      </ThemeProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The place menu's My tokens asks the Event Service for a login link (BAC-157).
  const { Providers } = createTestProviders(createMockClient({ latencyMs: [0, 0], storage: null }));
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  await screen.findByText("Screen");
}

describe("the Home tab", () => {
  it("says how many connection requests wait, from any screen", async () => {
    await renderShell(2);
    // The header's tabs and the phone's bar, which CSS shows one at a time.
    expect(screen.getAllByRole("link", { name: "Home, 2 connection requests" })).toHaveLength(2);
  });

  it("uses the singular for one request", async () => {
    await renderShell(1);
    expect(screen.getAllByRole("link", { name: "Home, 1 connection request" })).toHaveLength(2);
  });

  it("is plain Home while none wait", async () => {
    await renderShell(0);
    expect(screen.getAllByRole("link", { name: "Home" })).toHaveLength(2);
  });
});

it("keeps account actions available during setup while hiding navigation", async () => {
  await renderShell(0, false);
  expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Switch place/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
