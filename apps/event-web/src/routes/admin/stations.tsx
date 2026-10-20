import { createFileRoute } from "@tanstack/react-router";

import { StationsScreen } from "@/features/stations/stations-screen";

export const Route = createFileRoute("/admin/stations")({
  component: StationsScreen,
});
