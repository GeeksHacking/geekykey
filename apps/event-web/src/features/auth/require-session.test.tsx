import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/api/types";
import { RequireSession } from "@/features/auth/require-session";
import { SessionContext, type SessionState } from "@/lib/session";

const me: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant" },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function sessionWith(status: SessionState["status"], payload: MeResponse | null): SessionState {
  return {
    status,
    me: payload,
    error: undefined,
    refresh: async () => {},
    signIn: async () => me,
    signOut: async () => {},
  };
}

/** A two-route router: a gated page at /passport and a login page that records return_to. */
function makeRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const gated = createRoute({
    getParentRoute: () => rootRoute,
    path: "/passport",
    component: () => (
      <RequireSession>
        <p>Secret passport</p>
      </RequireSession>
    ),
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    validateSearch: (search: Record<string, unknown>) => ({
      return_to: typeof search.return_to === "string" ? search.return_to : undefined,
    }),
    component: () => <p>Login page</p>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([gated, login]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

describe("RequireSession", () => {
  it("shows the loading view while the session is unknown", async () => {
    render(
      <SessionContext.Provider value={sessionWith("loading", null)}>
        <RouterProvider router={makeRouter("/passport")} />
      </SessionContext.Provider>,
    );
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret passport")).not.toBeInTheDocument();
  });

  it("sends anonymous visitors to /login once, remembering where they were", async () => {
    const router = makeRouter("/passport");
    render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ return_to: "/passport" });
  });

  it("renders the screen once signed in", async () => {
    render(
      <SessionContext.Provider value={sessionWith("authenticated", me)}>
        <RouterProvider router={makeRouter("/passport")} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("Secret passport")).toBeInTheDocument());
  });
});
