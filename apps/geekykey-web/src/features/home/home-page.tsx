import type { Token } from "@/api/types";

import { isLeftOnMock } from "@/api/mode";
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
  // The list is the service's tokens, so a claim the mock would answer would claim a
  // sample token and leave the service still not listing it. The form is hidden while a
  // live build still sends the claim to the mock, the way each row hides its Release.
  const byCode = !isLeftOnMock("claimToken");

  return (
    <main className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-heading">My tokens</h1>
      {me.tokens.length === 0 ? <NoTokensYet byCode={byCode} /> : null}
      {byCode ? <ClaimByCodeForm /> : null}
      {me.tokens.length > 0 ? <TokenList tokens={me.tokens} /> : null}
      <EventButtons events={me.events} className="mt-8" />
    </main>
  );
}

/**
 * The empty state names the ways to claim a token that this build has, and it follows
 * the screens' guide that an empty state says what to do next. A live build still
 * sends the claim to the mock, so the form is not there and the phone is the only way
 * to claim one.
 */
function NoTokensYet({ byCode }: { byCode: boolean }) {
  return (
    <p className="mt-6 max-w-md text-base text-muted-foreground">
      {byCode
        ? "You haven't claimed a token yet. Tap one with your phone, or type its code below."
        : "You haven't claimed a token yet. Tap one with your phone to claim it."}
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
