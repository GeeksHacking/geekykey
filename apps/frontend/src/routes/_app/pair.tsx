import { createFileRoute } from "@tanstack/react-router";

import { PairScreen } from "@/features/tokens/pair-screen";

export const Route = createFileRoute("/_app/pair")({
  component: PairScreen,
});
