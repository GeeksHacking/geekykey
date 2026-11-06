import { createFileRoute, useRouterState } from "@tanstack/react-router";

import { EventSignOutScreen } from "@/features/auth/event-sign-out-screen";

export const Route = createFileRoute("/sign-out")({
  component: SignOutRoute,
});

function SignOutRoute() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  return <EventSignOutScreen userId={new URLSearchParams(hash).get("user")} />;
}
