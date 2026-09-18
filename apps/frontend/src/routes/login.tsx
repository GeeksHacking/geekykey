import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/features/auth/login-screen";
import { isSafeReturnTo } from "@/features/auth/paths";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { return_to?: string } =>
    isSafeReturnTo(search.return_to) ? { return_to: search.return_to } : {},
  component: LoginRoute,
});

function LoginRoute() {
  const { return_to } = Route.useSearch();
  return <LoginScreen returnTo={return_to} />;
}
