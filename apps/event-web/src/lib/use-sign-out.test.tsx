import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { Toaster } from "@/components/ui/sonner";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { useSignOut } from "@/lib/use-sign-out";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const KEY_SIGN_OUT = `${GEEKYKEY_SCREENS_URL}sign-out#user=${SEEDED_PARTICIPANT_ID}`;

let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  localStorage.clear();
  location = stubLocation();
});

afterEach(() => {
  location.restore();
  localStorage.clear();
});

/** A signed-in page with the two ways a session ends or starts here, on the real provider. */
function Buttons() {
  const session = useSession();
  const signOut = useSignOut();
  if (session.status !== "authenticated") return <p>Signed out</p>;
  return (
    <>
      <p>Signed in as {session.me?.user.id}</p>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={() => void session.signIn(SEEDED_PARTICIPANT_ID)}>Log in here</button>
    </>
  );
}

function open(api: MockApiClient, loginLink?: string) {
  const { Providers } = createTestProviders(api, { session: true, loginLink });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Buttons,
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>Login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <ThemeProvider>
      <Providers>
        <Toaster />
        <RouterProvider router={router as never} />
      </Providers>
    </ThemeProvider>,
  );
}

function mockService() {
  return createMockClient({ latencyMs: [0, 0], storage: null });
}

describe("signing out of the Event screens", () => {
  it("sends someone who arrived by login link to the GeekyKey screens, signed out here", async () => {
    const api = mockService();
    const user = userEvent.setup();
    open(api, "mock");

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(KEY_SIGN_OUT));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("remembers the arrival across a page load, since the session outlives the page", async () => {
    const api = mockService();
    const user = userEvent.setup();
    const first = open(api, "mock");
    await screen.findByRole("button", { name: "Sign out" });
    first.unmount();

    open(api);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(KEY_SIGN_OUT));
  });

  it("signs someone out as before when they logged in here", async () => {
    const api = mockService();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const user = userEvent.setup();
    open(api);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(location.assign).not.toHaveBeenCalled();
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("forgets the arrival once they log in here themselves", async () => {
    const api = mockService();
    const user = userEvent.setup();
    open(api, "mock");

    await user.click(await screen.findByRole("button", { name: "Log in here" }));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("doesn't count a link that failed, because the session underneath didn't come from it", async () => {
    const api = mockService();
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const user = userEvent.setup();
    open(api, "expired");

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("forgets the arrival after a sign-out, so the next person here isn't sent across", async () => {
    const api = mockService();
    const user = userEvent.setup();
    const first = open(api, "mock");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(location.assign).toHaveBeenCalledTimes(1));
    first.unmount();

    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    open(api);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(location.assign).toHaveBeenCalledTimes(1);
  });

  it("stays here and says why when the log out fails, because the session may still be there", async () => {
    const api = mockService();
    const user = userEvent.setup();
    open(api, "mock");
    await screen.findByRole("button", { name: "Sign out" });
    api.mock.failNext("service_unavailable");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("A required service is unavailable. Try again shortly."),
    ).toBeInTheDocument();
    expect(location.assign).not.toHaveBeenCalled();
  });
});
