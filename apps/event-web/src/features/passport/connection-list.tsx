import type { MeResponse } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { ConnectionRow } from "@/features/passport/connection-row";

/**
 * The user's connections, newest first as /me gives them. An event without a connections game
 * also gives an empty list, and /me has no flag for one, so the empty state waits on `questions`:
 * the answers game only runs on top of connections.
 */
export function ConnectionList({ me }: { me: MeResponse }) {
  if (me.connections.length === 0 && me.questions === null) return null;
  return (
    <section>
      <SectionHeading title="Connections" />
      {me.connections.length > 0 ? (
        <ul aria-label="Connections" className="divide-y rounded-lg border">
          {me.connections.map((connection) => (
            <ConnectionRow key={connection.connected_at} connection={connection} me={me} />
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
