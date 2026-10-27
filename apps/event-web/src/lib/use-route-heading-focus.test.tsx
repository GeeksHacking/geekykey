import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useRouteHeadingFocus } from "@/lib/use-route-heading-focus";

/*
  The hook runs once above the screens, so two bare routes are enough: each has the
  heading a screen gives PageHeader, and a link to the other.
*/
function Shell() {
  useRouteHeadingFocus();
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: Shell });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <>
      <h1 tabIndex={-1} data-page-heading>
        Home
      </h1>
      <Link to="/passport">Passport</Link>
    </>
  ),
});

const passportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/passport",
  component: () => (
    <>
      <h1 tabIndex={-1} data-page-heading>
        Passport
      </h1>
      <Link to="/">Home</Link>
    </>
  ),
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, passportRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router as never} />);
  return router;
}

describe("useRouteHeadingFocus", () => {
  it("focuses the heading of the screen the route changed to", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await screen.findByRole("heading", { level: 1, name: "Home" });

    await user.click(screen.getByRole("link", { name: "Passport" }));
    const passportHeading = await screen.findByRole("heading", { level: 1, name: "Passport" });
    await waitFor(() => expect(document.activeElement).toBe(passportHeading));

    await user.click(screen.getByRole("link", { name: "Home" }));
    const homeHeading = await screen.findByRole("heading", { level: 1, name: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(homeHeading));
  });

  it("leaves the focus alone on the first render", async () => {
    renderAt("/");
    await screen.findByRole("heading", { level: 1, name: "Home" });

    expect(document.activeElement).toBe(document.body);
  });
});
