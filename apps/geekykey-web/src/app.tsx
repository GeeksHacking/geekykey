import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { createAppClient } from "@/api/create-client";
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

const queryClient = createQueryClient();
const api = createAppClient();

export function App() {
  return (
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
