import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { useGoAfterLogin } from "@/features/auth/use-go-after-login";

/*
  A router with only /login. There is deliberately no /t/$uid route: the token page is
  FRO-20, which is the whole reason useGoAfterLogin navigates through history rather than
  the typed navigate, which only knows the routes in the tree.
*/
function setup(initialPath = "/login") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>Login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([login]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router as never} />);
  return router;
}

/** Calls the hook from inside the router, which is where it has to run. */
function GoAfterLogin({ returnTo }: { returnTo: string | undefined }) {
  const goAfterLogin = useGoAfterLogin();
  useEffect(() => {
    goAfterLogin(returnTo);
  }, [goAfterLogin, returnTo]);
  return <p>Signed in</p>;
}

function renderGoAfterLogin(returnTo: string | undefined, initialPath = "/login") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => null,
  });
  const done = createRoute({
    getParentRoute: () => rootRoute,
    path: "/done",
    component: () => <GoAfterLogin returnTo={returnTo} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([login, done]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router as never} />);
  return router;
}

describe("useGoAfterLogin", () => {
  it("goes back to a safe return_to, query and hash included", async () => {
    const router = renderGoAfterLogin("/t/04A1B2C3D4E5F6?highlight=yes#top", "/done");

    await waitFor(() => expect(router.state.location.pathname).toBe("/t/04A1B2C3D4E5F6"));
    expect(router.state.location.search).toEqual({ highlight: "yes" });
    // TanStack stores the hash without the leading "#".
    expect(router.state.location.hash).toBe("top");
  });

  it("does not follow a return_to pointing at another site", async () => {
    const router = renderGoAfterLogin("//evil.example/steal", "/done");

    // It falls back to the safe home instead, which is /login here since / has no route yet.
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.href.startsWith("//")).toBe(false);
    expect(router.state.location.href).not.toContain("evil.example");
  });

  it("falls back to My tokens when there is no return_to", async () => {
    const router = renderGoAfterLogin(undefined, "/done");

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("falls back to My tokens for a /login return_to, so sign-in cannot loop", async () => {
    const router = renderGoAfterLogin("/login", "/done");

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("starts on /login", async () => {
    const router = setup();
    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });
});
