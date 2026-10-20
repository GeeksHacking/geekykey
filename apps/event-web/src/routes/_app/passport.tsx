import { createFileRoute } from "@tanstack/react-router";

import { PassportScreen } from "@/features/passport/passport-screen";

export const Route = createFileRoute("/_app/passport")({
  component: PassportScreen,
});
