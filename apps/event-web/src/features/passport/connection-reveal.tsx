import type { MeResponse } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { ConnectionPerson } from "@/features/passport/connection-person";
import { ConnectionDice } from "@/features/passport/connection-dice";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";

/**
 * The match with a new connection, from agreement 0.13's draft (section 13). The draft's "You're a
 * {match}% match!" reads "a 80%", so PR #235 takes this wording instead. It says who with, as
 * BAC-147 asks, and stays until dismissed.
 */
export function ConnectionReveal({ me }: { me: MeResponse }) {
  const { connection, dismiss } = useConnectionReveal(me);
  if (!connection) return null;
  return (
    <section
      role="status"
      aria-label="New connection"
      className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <CornerBrackets />
      <div className="min-w-0">
        <p className="look-label text-muted-foreground">New connection</p>
        <p className="mt-1 text-xl font-semibold">
          {connection.match === null ? "You're connected!" : `${connection.match}% match!`}
        </p>
        <div className="mt-2">
          <ConnectionPerson connection={connection} />
        </div>
        <ConnectionDice dice={connection.dice} />
        {connection.match === null ? null : (
          <p className="mt-2 text-sm text-muted-foreground">
            Talk to find out which answers you share.
          </p>
        )}
      </div>
      <Button type="button" variant="ghost" className="self-start sm:self-auto" onClick={dismiss}>
        Dismiss
      </Button>
    </section>
  );
}
