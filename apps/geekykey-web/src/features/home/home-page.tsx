import type { Token } from "@/api/types";

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
 * Not in this ticket: claiming by code is FRO-30 and the event links are FRO-31.
 */
export function HomePage() {
  const { me } = useMe();

  return (
    <main className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-heading">My tokens</h1>
      {me.tokens.length === 0 ? <NoTokensYet /> : <TokenList tokens={me.tokens} />}
    </main>
  );
}

/**
 * The ticket fixes the empty state's sentence, and it follows the screens' guide that
 * an empty state says what to do next. The claim-by-code form arrives with FRO-30, so
 * today the next step is the phone.
 */
function NoTokensYet() {
  return (
    <p className="mt-6 max-w-md text-base text-muted-foreground">
      You haven't claimed a token yet. Tap one with your phone to claim it.
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
