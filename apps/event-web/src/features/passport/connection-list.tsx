import { Link } from "@tanstack/react-router";

import type { MeResponse } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { Button } from "@/components/ui/button";
import { connectionKey } from "@/features/passport/connection-key";
import { ConnectionRow } from "@/features/passport/connection-row";
import { NoConnections } from "@/features/passport/no-connections";
import { useDiceWaiting } from "@/features/passport/dice/dice-shown";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";

/** How many Home shows before the Connections tab has the rest (FRO-182). */
const HOME_SHOWN = 3;

/**
 * The newest connections on Home, three at most, with the rest behind "See all" on the
 * Connections tab (FRO-182). An event without a connections game also gives an empty list, and
 * /me has no flag for one, so the empty state waits on `questions`: the answers game only runs on
 * top of connections.
 */
export function ConnectionList({ me }: { me: MeResponse }) {
  // The reveal's dice wait for a tap, so this list keeps their result back until they land.
  const waiting = useDiceWaiting(me);
  // The reveal has its own reaction test, so a row offers one only for another connection.
  const { connection: revealed } = useConnectionReveal(me);
  if (me.connections.length === 0 && me.questions === null) return null;
  return (
    <section>
      <SectionHeading title="Connections" />
      {me.connections.length > 0 ? (
        <>
          <ul aria-label="Connections" className="divide-y rounded-lg border bg-card">
            {me.connections.slice(0, HOME_SHOWN).map((connection) => (
              <ConnectionRow
                key={connectionKey(connection)}
                connection={connection}
                me={me}
                showDice={connection !== waiting}
                canPlay={connection !== revealed}
              />
            ))}
          </ul>
          {me.connections.length > HOME_SHOWN ? (
            <div className="mt-2 flex justify-end">
              <Button asChild variant="link" size="sm">
                <Link to="/connections">See all</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <NoConnections />
      )}
    </section>
  );
}
