import type { MeResponse } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { ConnectionPerson } from "@/features/passport/connection-person";
import { DiceRoll } from "@/features/passport/dice/dice-roll";
import { markDiceShown, useDiceWaiting } from "@/features/passport/dice/dice-shown";
import { ReactionTest } from "@/features/passport/reaction/reaction-test";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";
import { cn } from "@/lib/utils";

/**
 * The match with a new connection, from agreement 0.13's draft (section 13). The draft's "You're a
 * {match}% match!" reads "a 80%", so PR #235 takes this wording instead. It says who with, as
 * BAC-147 asks, and stays until dismissed. Dismiss is always in the same corner, before and after
 * the roll, and on a wide screen the dice sit beside the person rather than under them.
 */
export function ConnectionReveal({ me }: { me: MeResponse }) {
  const { connection, dismiss } = useConnectionReveal(me);
  const waiting = useDiceWaiting(me);
  if (!connection) return null;
  return (
    <section
      role="status"
      aria-label="New connection"
      className="relative animate-in rounded-lg border bg-card p-4 duration-200 fade-in-0 slide-in-from-bottom-1 sm:p-5"
    >
      <CornerBrackets />
      <div className="-mt-1 flex items-center justify-between gap-3">
        <p className="look-label text-muted-foreground">New connection</p>
        <Button
          type="button"
          variant="ghost"
          className="-mr-2 -my-1"
          onClick={() => {
            // Dismissed without rolling, the list shows the result instead.
            markDiceShown(me.user.id, connection.connected_at);
            dismiss();
          }}
        >
          Dismiss
        </Button>
      </div>
      <div
        className={cn(
          "mt-1 grid gap-4",
          (connection.dice || connection.reaction) && "sm:grid-cols-[minmax(0,1fr)_15rem] sm:gap-6",
        )}
      >
        <div className="min-w-0">
          <p className="type-lead">
            {connection.match === null ? "You're connected!" : `${connection.match}% match!`}
          </p>
          <div className="mt-2">
            <ConnectionPerson connection={connection} />
          </div>
          {connection.match === null ? null : (
            <p className="mt-2 text-sm text-muted-foreground">
              Talk to find out which answers you share.
            </p>
          )}
        </div>
        <DiceRoll
          key={connection.connected_at}
          userId={me.user.id}
          connection={connection}
          waiting={waiting === connection}
        />
        {connection.reaction && connection.id ? (
          <ReactionTest
            key={connection.id}
            connectionId={connection.id}
            reaction={connection.reaction}
          />
        ) : null}
      </div>
    </section>
  );
}
