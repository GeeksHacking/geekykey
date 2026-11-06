import { createFileRoute, useRouterState } from "@tanstack/react-router";

import { KeySignOutScreen } from "@/features/auth/key-sign-out-screen";

export const Route = createFileRoute("/sign-out")({
  component: SignOutRoute,
});

function SignOutRoute() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  return <KeySignOutScreen userId={new URLSearchParams(hash).get("user")} />;
}
