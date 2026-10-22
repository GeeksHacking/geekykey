import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiClient } from "@/api/client";
import { ApiProvider } from "@/api/provider";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";

/** The app's provider stack for tests, with retries off so a deliberate failure surfaces at once. */
export function createTestProviders(
  api: ApiClient,
  { session = false, loginLink }: { session?: boolean; loginLink?: string } = {},
) {
  const queryClient = createQueryClient({ retry: false });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          {session ? <SessionProvider loginLink={loginLink}>{children}</SessionProvider> : children}
        </QueryClientProvider>
      </ApiProvider>
    );
  }
  return { Providers, queryClient };
}
