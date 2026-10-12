import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "@/api/provider";
import { createMockClient } from "@/api/mock/client";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";

/*
  The /login route's own rule, driven through the real route tree.

  `isSafeReturnTo` is unit-tested in features/auth/paths.test.ts, but that only proves the
  predicate. What matters here is whether the route *applies* it: the router merges the
  validated search over the parsed one, so a validator that omits the key leaves it in place,
  and the sign-in link is then built from an address on another site. These tests
  arrive at /login with a hostile return_to, which is the only way to see that.
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

async function loginHref(query: string) {
  const { router } = renderLoginAt(query);
  const link = await screen.findByRole("link", { name: "Sign in with GeeksHacking" });
  await waitFor(() => expect(router.state.status).toBe("idle"));
  return {
    href: link.getAttribute("href"),
    browserUrl: router.state.location.href,
    search: router.state.location.search,
  };
}

describe("the /login route's return_to rule", () => {
  it("keeps a relative path, so the page you were on is the page you return to", async () => {
    const { href, browserUrl } = await loginHref("?return_to=%2Fpassport");

    expect(browserUrl).toBe("/login?return_to=%2Fpassport");
    expect(href).toBe("/auth/login?return_to=%2Fpassport");
  });

  it("falls back to the home page when there is no return_to", async () => {
    const { href } = await loginHref("");

    expect(href).toBe("/auth/login?return_to=%2F");
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
    it(`drops the ${label} address, in the URL and on the sign-in link`, async () => {
      const { href, browserUrl, search } = await loginHref(query);

      expect(search).not.toHaveProperty("return_to");
      expect(browserUrl).toBe("/login");
      expect(href).not.toContain("evil.example");
      expect(href).toBe("/auth/login?return_to=%2F");
    });
  }

  it("drops /login itself, so signing in cannot bounce", async () => {
    const { browserUrl, href } = await loginHref("?return_to=%2Flogin");

    expect(browserUrl).toBe("/login");
    expect(href).toBe("/auth/login?return_to=%2F");
  });

  it("does not depend on the other app having the same rule", async () => {
    // This suite pins apps/frontend's route on its own. If someone reverts the validator to
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
