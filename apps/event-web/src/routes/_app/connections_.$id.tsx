import { createFileRoute } from "@tanstack/react-router";

import { ConnectionProfileScreen } from "@/features/passport/connection-profile-screen";

export const Route = createFileRoute("/_app/connections_/$id")({
  component: function ConnectionProfileRoute() {
    const { id } = Route.useParams();
    return <ConnectionProfileScreen id={id} />;
  },
});
