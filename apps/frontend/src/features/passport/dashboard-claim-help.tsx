import { Key } from "@phosphor-icons/react";

import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

/*
  Shown only until the participant has their first tap. Claiming now happens in
  the GeekyKey app, so this points there rather than pairing on the Event screens.
*/
export function DashboardClaimHelp() {
  return (
    <section
      aria-labelledby="claim-token-title"
      className="space-y-4 rounded-lg border border-primary-text/40 bg-primary/15 p-4 dark:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div>
          <h2 id="claim-token-title" className="font-medium">
            Tap your token with your phone to claim it
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Claim it in the GeekyKey app, then tap any event station to start collecting stamps.
          </p>
        </div>
      </div>

      <div className="border-t border-primary-text/20 pt-3">
        <a
          href={GEEKYKEY_SCREENS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary-text underline-offset-4 hover:underline"
        >
          My tokens
        </a>
      </div>
    </section>
  );
}
