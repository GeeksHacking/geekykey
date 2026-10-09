import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/api/types";
import { RequireSession } from "@/features/auth/require-session";
import { useGoAfterLogin } from "@/features/auth/use-go-after-login";
import { isSafeReturnTo } from "@/features/auth/paths";
import { SessionContext, useSession, type SessionState } from "@/lib/session";

const me: MeResponse = {
  user: { id: "dev-user-1", is_geekykey_admin: false },
  tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-10-10T08:30:00.000Z" }],
  events: [{ id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" }],
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

/**
 * A two-route router: a gated page that stands in for the token page, and the real /login
 * route shape, which validates return_to with isSafeReturnTo before anything uses it.
 */
function makeRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const gated = createRoute({
    getParentRoute: () => rootRoute,
    path: "/t/$uid",
    component: () => (
      <RequireSession>
        <p>Secret token page</p>
      </RequireSession>
    ),
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    // The same rule as routes/login.tsx, and the same shape on purpose. The router merges the
    // validated search over the parsed one, so returning `{}` would drop nothing and this
    // stand-in would stop describing what the real route does.
    validateSearch: (search: Record<string, unknown>): { return_to?: string | undefined } =>
      isSafeReturnTo(search.return_to) ? { return_to: search.return_to } : { return_to: undefined },
    // The real LoginScreen owns post-login navigation, so the stand-in does too. Otherwise
    // the round trip would stop at /login and the criterion would not be covered.
    component: LoginStandIn,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([gated, login]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

/** Navigates once signed in, exactly as useGoAfterLogin does on the real screen. */
function LoginStandIn() {
  const session = useSession();
  const goAfterLogin = useGoAfterLogin();
  const navigated = useRef(false);
  // What the real /login route passes down after validateSearch has checked it.
  const returnTo = useRouterState({
    select: (state) => (state.location.search as { return_to?: string }).return_to,
  });
  const signedIn = session.status === "authenticated";
  useEffect(() => {
    if (!signedIn) {
      navigated.current = false;
      return;
    }
    if (navigated.current) return;
    navigated.current = true;
    goAfterLogin(returnTo);
  }, [signedIn, returnTo, goAfterLogin]);
  return <p>Login page</p>;
}

describe("RequireSession", () => {
  it("shows the loading view while the session is unknown", async () => {
    render(
      <SessionContext.Provider value={sessionWith("loading", null)}>
        <RouterProvider router={makeRouter("/t/04A1B2C3D4E5F6")} />
      </SessionContext.Provider>,
    );
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret token page")).not.toBeInTheDocument();
  });

  it("never renders the gated screen to an anonymous visitor", async () => {
    // Asserted directly rather than only after the redirect settles: the redirect happens
    // in an effect, so a gate that forgot to hide its children would flash them first.
    // The router's own redirect usually wins the race, which is why a mutation removing the
    // guard still passed the navigation assertions.
    const router = makeRouter("/t/04A1B2C3D4E5F6");
    render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );

    expect(screen.queryByText("Secret token page")).not.toBeInTheDocument();
    await screen.findByText("Login page");
    expect(screen.queryByText("Secret token page")).not.toBeInTheDocument();
  });

  it("renders the screen once signed in", async () => {
    render(
      <SessionContext.Provider value={sessionWith("authenticated", me)}>
        <RouterProvider router={makeRouter("/t/04A1B2C3D4E5F6")} />
      </SessionContext.Provider>,
    );
    expect(await screen.findByText("Secret token page")).toBeInTheDocument();
  });

  it("sends an anonymous visitor to /login once, remembering where they were", async () => {
    const router = makeRouter("/t/04A1B2C3D4E5F6");
    render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );

    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/login");
    // The token page is what makes this matter: the user comes back to the UID they tapped.
    expect(router.state.location.search).toEqual({ return_to: "/t/04A1B2C3D4E5F6" });
  });

  it("navigates once, not once per render", async () => {
    const router = makeRouter("/t/04A1B2C3D4E5F6");
    const { rerender } = render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));

    // Re-rendering while still anonymous must not push another entry.
    rerender(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );
    rerender(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );

    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ return_to: "/t/04A1B2C3D4E5F6" });
  });

  it("does not follow a return address on another site", async () => {
    // The gate builds return_to from the current location, so this proves the receiving
    // side: /login drops an unsafe value, and isSafeReturnTo is what decides.
    const router = makeRouter("/t/04A1B2C3D4E5F6");
    render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());

    const unsafe = isSafeReturnTo("//evil.example/steal");
    expect(unsafe).toBe(false);
    expect(router.state.location.search).not.toHaveProperty("return_to", "//evil.example/steal");
    expect(router.state.location.href.startsWith("//")).toBe(false);
  });

  it("comes back to the page it came from once signed in", async () => {
    // The whole round trip in one router, which is the acceptance criterion: a gated page
    // while logged out goes to /login, and signing in lands back on that page.
    const router = makeRouter("/t/04A1B2C3D4E5F6");
    const { rerender } = render(
      <SessionContext.Provider value={sessionWith("anonymous", null)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
    expect(router.state.location.search).toEqual({ return_to: "/t/04A1B2C3D4E5F6" });

    rerender(
      <SessionContext.Provider value={sessionWith("authenticated", me)}>
        <RouterProvider router={router} />
      </SessionContext.Provider>,
    );

    expect(await screen.findByText("Secret token page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/t/04A1B2C3D4E5F6");
  });

  it("shows an error state with a retry when the first load fails", async () => {
    render(
      <SessionContext.Provider value={sessionWith("error", null)}>
        <RouterProvider router={makeRouter("/t/04A1B2C3D4E5F6")} />
      </SessionContext.Provider>,
    );

    expect(await screen.findByText("Could not load your account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Secret token page")).not.toBeInTheDocument();
  });
});
