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

import { ApiError } from "@/api/errors";
import type { MeResponse } from "@/api/types";
import { RequireSession } from "@/features/auth/require-session";
import { SessionContext, type SessionState } from "@/lib/session";

const me: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant", has_name: true },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function sessionWith(
  status: SessionState["status"],
  payload: MeResponse | null,
  error: unknown = undefined,
): SessionState {
  return {
    status,
    me: payload,
    error,
    refresh: async () => {},
    signIn: async () => me,
    signInWithFirebase: async () => me,
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

  it("says a service is unavailable when the Worker answers 503", async () => {
    // The Worker in front of the screens answers 503 service_unavailable when the Event
    // Service gave no answer at all (agreement section 2), so the screen says the service
    // is down rather than that something went wrong.
    render(
      <SessionContext.Provider
        value={sessionWith("error", null, new ApiError(503, "service_unavailable"))}
      >
        <RouterProvider router={makeRouter("/passport")} />
      </SessionContext.Provider>,
    );

    expect(
      await screen.findByText("A required service is unavailable. Try again shortly."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Secret passport")).not.toBeInTheDocument();
  });
});
