import { createFileRoute } from "@tanstack/react-router";

import { TokenPage } from "@/features/token/token-page";

/**
 * The token page, `/t/<UID>` (agreement 8.5). Every token carries the address
 * `https://key.geekshacking.com/t/<UID>`, and a phone tap opens it.
 *
 * It sits under `_app`, so RequireSession sends an anonymous visitor to /login with
 * `return_to` and brings them back here afterwards. The UID reaches the screen as a
 * param because it is the address; nothing else reads the URL.
 */
export const Route = createFileRoute("/_app/t/$uid")({
  component: TokenRoute,
});

function TokenRoute() {
  const { uid } = Route.useParams();
  return <TokenPage uid={uid} />;
}
