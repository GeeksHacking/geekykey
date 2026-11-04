import { Key } from "@phosphor-icons/react";

import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

/*
  Shown only until the participant has their first tap. The Event Service's /me has no
  token in it (agreement 8.1), so this can't say whether the reader has claimed one: it
  says how to start either way, and points someone without a token at My tokens.
*/
export function DashboardTapHelp() {
  return (
    <section
      aria-labelledby="tap-token-title"
      className="rounded-lg border border-primary-text/40 bg-primary/15 p-4 dark:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div>
          <h2 id="tap-token-title" className="font-medium">
            Tap your token at any station to start collecting stamps
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No token yet? Claim one on{" "}
            <a
              href={GEEKYKEY_SCREENS_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary-text underline-offset-4 hover:underline"
            >
              My tokens
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
