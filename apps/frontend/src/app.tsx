import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { createMockClient } from "@/api/mock/client";
import { ApiProvider } from "@/api/provider";
import { routeTree } from "@/routeTree.gen";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

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

// Mockup phase: every screen talks to the in-memory client. Swapping this for
// the HTTP client is the only change needed to go live.
const api = createMockClient({ simulate: true });
const queryClient = createQueryClient();

export function App() {
  return (
    <ThemeProvider>
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </QueryClientProvider>
      </ApiProvider>
    </ThemeProvider>
  );
}
