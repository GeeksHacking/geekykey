import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { User } from "@/api/types";
import { AdminShell } from "@/components/layout/admin-shell";
import { ThemeProvider } from "@/lib/theme-provider";

const user = { id: "organizer-1", display_name: "Priya Raman", role: "organizer" } as User;

async function renderShell() {
  const rootRoute = createRootRoute({
    component: () => (
      <ThemeProvider>
        <AdminShell user={user} onSignOut={() => {}}>
          <p>Screen</p>
        </AdminShell>
      </ThemeProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/admin/stations"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText("Screen");
}

describe("the organiser shell", () => {
  it("offers the event/key switch in the sidebar and the phone header", async () => {
    await renderShell();

    // Both are in the DOM; CSS shows the sidebar from lg and the header below it.
    const sites = screen.getAllByRole("navigation", { name: "Sites" });
    expect(sites).toHaveLength(2);
    for (const nav of sites) {
      expect(within(nav).getByText("Event")).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Key" })).toBeInTheDocument();
    }
  });
});
