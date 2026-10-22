import { IconContext } from "@phosphor-icons/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { createAppClient } from "@/api/create-client";
import { ApiProvider } from "@/api/provider";
import { routeTree } from "@/routeTree.gen";
import { takeLoginLink } from "@/lib/login-link";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

// Taken once, before the router reads the address and before the session reads /me, so the
// link is out of the address at once and sent before anything else asks who is signed in.
const loginLink = takeLoginLink();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Mock client, or the mock with the live slices swapped in. src/api/create-client.ts decides.
const api = createAppClient();
const queryClient = createQueryClient();

// The branding kit draws its icons filled. An icon that sets its own weight keeps it.
const ICONS = { weight: "fill" } as const;

export function App() {
  return (
    <IconContext.Provider value={ICONS}>
      <ThemeProvider>
        <ApiProvider client={api}>
          <QueryClientProvider client={queryClient}>
            <SessionProvider loginLink={loginLink}>
              <RouterProvider router={router} />
            </SessionProvider>
          </QueryClientProvider>
        </ApiProvider>
      </ThemeProvider>
    </IconContext.Provider>
  );
}
