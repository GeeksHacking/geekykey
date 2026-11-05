import { createFileRoute } from "@tanstack/react-router";

import { TokenKindsPage } from "@/features/token-kinds/token-kinds-page";

export const Route = createFileRoute("/_app/admin/token-kinds")({
  component: TokenKindsPage,
});
