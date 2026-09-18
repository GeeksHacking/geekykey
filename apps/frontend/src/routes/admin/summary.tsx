import { createFileRoute } from "@tanstack/react-router";

import { SummaryScreen } from "@/features/stats/summary-screen";

export const Route = createFileRoute("/admin/summary")({
  component: SummaryScreen,
});
