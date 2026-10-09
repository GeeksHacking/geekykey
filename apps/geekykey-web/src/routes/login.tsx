import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/features/auth/login-screen";
import { isSafeReturnTo } from "@/features/auth/paths";

export const Route = createFileRoute("/login")({
  // An unsafe return_to is dropped here rather than at the point of use, so nothing
  // downstream has to trust it. Agreement 7.2 wants a relative path on this hostname.
  //
  // The key must be named with an explicit `undefined`. The router *merges* the validated
  // search over the parsed one rather than replacing it, so returning `{}` drops nothing and
  // whatever was in the URL survives. Measured on this version: `{}` left
  // "//evil.example/steal" in both the match and the URL, and the Portal sign-in link was then
  // built from it. Only `{ return_to: undefined }` removes the key and rewrites the URL.
  validateSearch: (search: Record<string, unknown>): { return_to?: string | undefined } =>
    isSafeReturnTo(search.return_to) ? { return_to: search.return_to } : { return_to: undefined },
  component: LoginRoute,
});

function LoginRoute() {
  const { return_to } = Route.useSearch();
  return <LoginScreen returnTo={return_to} />;
}
