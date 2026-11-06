import type { Connection, MeResponse } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { ConnectionRow } from "@/features/passport/connection-row";
import { useDiceWaiting } from "@/features/passport/dice/dice-shown";

/**
 * A connection has no ID, and two can share `connected_at`. The other fields that never
 * change keep their rows apart. `shared` and `display_name` are left out because they can
 * change, and a changed key would remount the row and close its panel.
 */
function connectionKey(connection: Connection): string {
  return `${connection.connected_at}-${connection.kind ?? "none"}-${connection.match ?? "none"}`;
}

/**
 * The user's connections, newest first as /me gives them. An event without a connections game
 * also gives an empty list, and /me has no flag for one, so the empty state waits on `questions`:
 * the answers game only runs on top of connections.
 */
export function ConnectionList({ me }: { me: MeResponse }) {
  // The reveal's dice wait for a tap, so this list keeps their result back until they land.
  const waiting = useDiceWaiting(me);
  if (me.connections.length === 0 && me.questions === null) return null;
  return (
    <section>
      <SectionHeading title="Connections" />
      {me.connections.length > 0 ? (
        <ul aria-label="Connections" className="divide-y rounded-lg border bg-card">
          {me.connections.map((connection) => (
            <ConnectionRow
              key={connectionKey(connection)}
              connection={connection}
              me={me}
              showDice={connection !== waiting}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No connections yet. Tap someone&apos;s token with your phone to connect.
        </p>
      )}
    </section>
  );
}
