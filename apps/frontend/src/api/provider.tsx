import type { ReactNode } from "react";

import type { ApiClient } from "@/api/client";
import { ApiContext } from "@/api/context";

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}
