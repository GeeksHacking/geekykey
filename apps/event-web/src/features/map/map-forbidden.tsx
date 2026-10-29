import { Prohibit } from "@phosphor-icons/react";

import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Agreement 9.10's `forbidden`. A map screen's /me says `participant`, so only the map's own
 * answer can tell the screen it may not read the map. Log out is here because the screen is
 * a shared one, and someone has to sign it in again as the right account.
 */
export function MapForbidden({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="flex max-w-md flex-col items-center">
        <Wordmark />
        <Prohibit className="mt-8 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-heading">
          This account can't show the map
        </h1>
        <p className="mt-2 text-muted-foreground">
          The map is for organisers and for the accounts set up as map screens. Log out, then log in
          as one of those.
        </p>
        <Button className="mt-6" onClick={onSignOut}>
          Log out
        </Button>
      </div>
    </main>
  );
}
