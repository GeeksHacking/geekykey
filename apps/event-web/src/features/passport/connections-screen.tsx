import { PageHeader } from "@/components/layout/page-header";
import { ConnectionCard } from "@/features/passport/connection-card";
import { connectionKey } from "@/features/passport/connection-key";
import { ConnectionRequests } from "@/features/passport/connection-requests";
import { NoConnections } from "@/features/passport/no-connections";
import { useDiceWaiting } from "@/features/passport/dice/dice-shown";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";
import { useMe } from "@/lib/session";

/**
 * Everyone the user has met (FRO-182), which Home had as its seventh block: the requests first,
 * because they still need an answer, then every connection as a card, newest first as /me gives
 * them. The reveal stays on Home and the passport, where the token page's login link lands.
 */
export function ConnectionsScreen() {
  const { me } = useMe();
  // The reveal's dice wait for a tap, so the cards keep their result back until they land.
  const waiting = useDiceWaiting(me);
  // The reveal has its own reaction test, so a card offers one only for another connection.
  const { connection: revealed } = useConnectionReveal(me);
  return (
    <div className="space-y-6">
      <PageHeader title="Connections" />
      <ConnectionRequests requests={me.connection_requests} />
      {me.connections.length > 0 ? (
        <ul aria-label="Connections" className="divide-y rounded-lg border bg-card">
          {me.connections.map((connection) => (
            <ConnectionCard
              key={connectionKey(connection)}
              connection={connection}
              me={me}
              showDice={connection !== waiting}
              canPlay={connection !== revealed}
            />
          ))}
        </ul>
      ) : me.questions !== null ? (
        <NoConnections />
      ) : null}
    </div>
  );
}
