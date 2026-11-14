import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsScreen } from "@/features/passport/connections-screen";

export const Route = createFileRoute("/_app/connections")({
  component: ConnectionsScreen,
});
