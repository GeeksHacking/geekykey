import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/api/types";
import { ParticipantShell } from "@/components/layout/participant-shell";
import { ThemeProvider } from "@/lib/theme-provider";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const user = { id: "user-1", display_name: "Alex Tan", role: "participant" } as User;

async function renderShell(connectionRequests: number) {
  const rootRoute = createRootRoute({
    component: () => (
      <ThemeProvider>
        <ParticipantShell user={user} onSignOut={() => {}} connectionRequests={connectionRequests}>
          <p>Screen</p>
        </ParticipantShell>
      </ThemeProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
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
