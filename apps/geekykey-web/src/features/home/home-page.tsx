import type { Token } from "@/api/types";

import { EventButtons } from "@/components/event-buttons";
import { ManualClaim } from "@/features/home/manual-claim";
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
 * The page reads in the order most people need it (FRO-155): their tokens, then the
 * buttons that open each event in /me as the same user (FRO-31), then the manual claim.
 * The event buttons do not depend on the user holding a token: the events are the ones
 * the service lists, whoever is asking. On a phone they fill the column, so the event is
 * the page's one large, yellow action.
 *
 * The claim-by-code form (FRO-30) is there whenever the page is, behind "Claim a token
 * manually", closed on load, for a token the phone cannot read.
 */
export function HomePage() {
  const { me } = useMe();

  return (
    <div className="flex flex-col">
      <h1 tabIndex={-1} className="type-title outline-hidden">
        My tokens
      </h1>
      {me.tokens.length === 0 ? <NoTokensYet /> : null}
      {me.tokens.length > 0 ? <TokenList tokens={me.tokens} /> : null}
      <EventButtons events={me.events} className="mt-8 items-stretch sm:items-start" />
      <div className="mt-10">
        <ManualClaim />
      </div>
    </div>
  );
}

/**
 * The empty state names both ways to claim a token, and it follows the screens' guide
 * that an empty state says what to do next. It names the disclosure by its label, so
 * someone whose phone can't read a token knows what to look for.
 */
function NoTokensYet() {
  return (
    <p className="mt-6 max-w-md rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      You haven't claimed a token yet. Tap one with your phone to open its page, or use 'Claim a
      token manually' below.
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
