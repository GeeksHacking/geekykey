import { Key } from "@phosphor-icons/react";

/*
  Shown only until the participant has their first tap. The Event Service's /me has no
  token in it (agreement 8.1), so this says how to start. The dashboard's My tokens link
  covers claiming and releasing (FRO-129), so this does not repeat it.
*/
export function DashboardTapHelp() {
  return (
    <section
      aria-labelledby="tap-token-title"
      className="rounded-lg border border-primary-text/40 bg-primary/15 p-4 dark:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <h2 id="tap-token-title" className="font-medium">
          Tap your token at any station to start collecting stamps
        </h2>
      </div>
    </section>
  );
}
