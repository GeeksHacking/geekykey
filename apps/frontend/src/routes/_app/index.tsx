import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "@/features/passport/dashboard-screen";

export const Route = createFileRoute("/_app/")({
  component: DashboardScreen,
});
