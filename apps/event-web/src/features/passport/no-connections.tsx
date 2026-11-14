/**
 * What to do while the user has no connections, on Home and on the Connections tab (FRO-182).
 * It says nothing about an event without the answers game: /me has no flag for the connections
 * game, so the screens can only tell them apart by `questions`, and each caller keeps that rule.
 */
export function NoConnections() {
  return (
    <p className="text-sm text-muted-foreground">
      No connections yet. Tap someone&apos;s token with your phone to connect.
    </p>
  );
}
