import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/features/auth/login-screen";
import { isSafeReturnTo } from "@/features/auth/paths";

export const Route = createFileRoute("/login")({
  // An unsafe return_to is dropped here rather than at the point of use, so nothing
  // downstream has to trust it. Agreement 7.2 wants a relative path on this hostname.
  validateSearch: (search: Record<string, unknown>): { return_to?: string } =>
    isSafeReturnTo(search.return_to) ? { return_to: search.return_to } : {},
  component: LoginRoute,
});

function LoginRoute() {
  const { return_to } = Route.useSearch();
  return <LoginScreen returnTo={return_to} />;
}
