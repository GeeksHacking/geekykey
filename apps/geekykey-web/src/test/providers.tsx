import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiClient } from "@/api/client";
import { ApiProvider } from "@/api/provider";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

/** The app's provider stack for tests, with retries off so a deliberate failure surfaces at once. */
export function createTestProviders(
  api: ApiClient,
  { session = false }: { session?: boolean } = {},
) {
  const queryClient = createQueryClient({ retry: false });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          {/* Theme wraps everything: the login screen's toggle reads it, so a test that
              renders that screen needs the provider even without a session. */}
          <ThemeProvider>
            {session ? <SessionProvider>{children}</SessionProvider> : children}
          </ThemeProvider>
        </QueryClientProvider>
      </ApiProvider>
    );
  }
  return { Providers, queryClient };
}
