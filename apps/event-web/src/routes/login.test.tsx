import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient } from "@/api/mock/client";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "auth" })),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

/*
  The Firebase sign-in is the only way in now, so the module is mocked to hand back a token
  and the real sign-in path runs: the screen, the session and the service's own answer.
*/
vi.mock("@/lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firebase")>()),
  signInWithGoogle: vi.fn(async () => "id-token"),
  hasFirebaseConfig: () => true,
}));

/*
  The /login route's own rule, driven through the real route tree.

  `isSafeReturnTo` is unit-tested in features/auth/paths.test.ts, but that only proves the
  predicate. What matters here is whether the route *applies* it: the router merges the
  validated search over the parsed one, so a validator that omits the key leaves it in place,
  and the sign-in then sends the person to an address on another site. These tests arrive
  at /login with a hostile return_to, which is the only way to see that.
*/
function renderLoginAt(query: string) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/login${query}`] }),
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
  return { router };
}

/**
 * The route's own rule and where the person lands, from one render: the browser before
 * anyone signs in, and the browser after.
 */
async function signInAt(query: string) {
  const { router } = renderLoginAt(query);
  const button = await screen.findByRole("button", { name: "Continue with Google" });
  await waitFor(() => expect(router.state.status).toBe("idle"));
  const before = {
    browserUrl: router.state.location.href,
    search: router.state.location.search,
  };

  await userEvent.setup().click(button);
  await waitFor(() => expect(router.state.location.pathname).not.toBe("/login"));
  return {
    before,
    browserUrl: router.state.location.href,
    pathname: router.state.location.pathname,
  };
}

describe("the /login route's return_to rule", () => {
  it("keeps a relative path, so the page you were on is the page you return to", async () => {
    const { before } = await signInAt("?return_to=%2Fpassport");

    expect(before.browserUrl).toBe("/login?return_to=%2Fpassport");
  });

  it("sends the person back to that page after signing in", async () => {
    const { pathname } = await signInAt("?return_to=%2Fpassport");

    expect(pathname).toBe("/passport");
  });

  it("falls back to the home page when there is no return_to", async () => {
    const { pathname } = await signInAt("");

    expect(pathname).toBe("/");
  });

  // Each of these is what the router leaves in place if the rule stops being applied. They
  // are the cases that matter, so they are the cases that get asserted.
  const hostile: [string, string][] = [
    ["protocol-relative", "?return_to=%2F%2Fevil.example%2Fsteal"],
    ["absolute", "?return_to=https%3A%2F%2Fevil.example%2Fsteal"],
    ["backslash", "?return_to=%2F%5Cevil.example%2Fsteal"],
    ["encoded protocol-relative", "?return_to=%2F%252f%252fevil.example%2Fsteal"],
  ];

  for (const [label, query] of hostile) {
    it(`drops the ${label} address, in the URL and after signing in`, async () => {
      const { before, browserUrl, pathname } = await signInAt(query);

      expect(before.search).not.toHaveProperty("return_to");
      expect(before.browserUrl).toBe("/login");
      expect(browserUrl).not.toContain("evil.example");
      expect(pathname).toBe("/");
    });
  }

  it("drops /login itself, so signing in cannot bounce", async () => {
    const { pathname } = await signInAt("?return_to=%2Flogin");

    expect(pathname).toBe("/");
  });

  it("does not depend on the other app having the same rule", async () => {
    // This suite pins apps/event-web's route on its own. If someone reverts the validator to
    // `{}`, only this file notices.
    const login = await import("@/routes/login");
    const options = (
      login.Route as unknown as {
        options: { validateSearch: (s: Record<string, unknown>) => Record<string, unknown> };
      }
    ).options;

    expect(options.validateSearch({ return_to: "//evil.example/steal" })).toEqual({
      return_to: undefined,
    });
  });
});
