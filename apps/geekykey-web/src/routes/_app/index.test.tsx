import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";

/*
  The home route behind the real gate, driven through the whole published tree the way
  the /login route's tests are. What a failing /me does to "/" is the gate's decision,
  not the home page's. failNext lands on the session's own first call: the gate renders
  nothing else until it is authenticated, so nothing competes for the queued failure.
*/
function renderHome() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  api.mock.failNext("claims_unavailable");
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = createQueryClient({ retry: false });
  render(
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router as never} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}

describe("the home route behind the gate", () => {
  it("says section 13's claims_unavailable sentence on a failed me, and the retry recovers", async () => {
    renderHome();

    expect(await screen.findByText("Couldn't reach GeeksHacking. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My tokens" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "My tokens" })).toBeInTheDocument();
    // The retry succeeded, so the list is the user's two tokens, oldest claim first.
    expect(screen.getByText("04 A1 B2 C3 D4 E5 F6")).toBeInTheDocument();
    expect(screen.getByText("04 B7 C9 E1 F3 A5")).toBeInTheDocument();
  });
});
