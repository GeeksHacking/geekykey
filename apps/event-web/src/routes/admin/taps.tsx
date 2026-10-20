import { createFileRoute } from "@tanstack/react-router";

import { TapsScreen } from "@/features/taps/taps-screen";

export const Route = createFileRoute("/admin/taps")({
  component: TapsScreen,
});
