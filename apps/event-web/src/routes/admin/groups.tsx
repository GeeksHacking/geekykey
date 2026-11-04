import { createFileRoute } from "@tanstack/react-router";

import { GroupsScreen } from "@/features/groups/groups-screen";

export const Route = createFileRoute("/admin/groups")({
  component: GroupsScreen,
});
