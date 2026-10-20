import { createFileRoute } from "@tanstack/react-router";

import { FallbackScreen } from "@/features/fallback/fallback-screen";

export const Route = createFileRoute("/admin/fallback")({
  component: FallbackScreen,
});
