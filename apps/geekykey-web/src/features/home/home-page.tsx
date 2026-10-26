import type { Token } from "@/api/types";

import { EventButtons } from "@/components/event-buttons";
import { ClaimByCodeForm } from "@/features/home/claim-by-code-form";
import { TokenRow } from "@/features/home/token-row";
import { useMe } from "@/lib/session";

/**
 * My tokens is the home page of the GeekyKey screens (agreement 8.4, FRO-27). The list
 * is the session's own me payload: the query that answers "Am I logged in?" already
 * holds the user's tokens, oldest claim first, so this page keeps no query of its own.
 * A me call that fails is the gate's business (RequireSession renders the loading view,
 * the error state and the redirect to /login), so this page only renders with a
 * signed-in user.
 *
 * The buttons under the list open each event in /me, as the same user (FRO-31). They
 * do not depend on the user holding a token: the events are the ones the service
 * lists, whoever is asking.
 *
 * The claim-by-code form sits above the list, and is there whenever the page is, so a
 * second token can be claimed without going back to the token page (FRO-30).
 */
export function HomePage() {
  const { me } = useMe();

  return (
    <main className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-heading">My tokens</h1>
      {me.tokens.length === 0 ? <NoTokensYet /> : null}
      <ClaimByCodeForm />
      {me.tokens.length > 0 ? <TokenList tokens={me.tokens} /> : null}
      <EventButtons events={me.events} className="mt-8" />
    </main>
  );
}

/**
 * The empty state names both ways to claim a token, and it follows the screens' guide
 * that an empty state says what to do next.
 */
function NoTokensYet() {
  return (
    <p className="mt-6 max-w-md text-base text-muted-foreground">
      You haven't claimed a token yet. Tap one with your phone, or type its UID below.
    </p>
  );
}

/** The tokens in the order /me lists them, oldest claim first (agreement 8.4). */
function TokenList({ tokens }: { tokens: Token[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {tokens.map((token) => (
        <li key={token.uid}>
          <TokenRow token={token} />
        </li>
      ))}
    </ul>
  );
}
