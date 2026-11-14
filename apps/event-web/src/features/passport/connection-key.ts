import type { Connection } from "@/api/types";

/**
 * A connection's own ID when the service gives one (BAC-156). A service from before it gives
 * none, and two connections can share `connected_at`, so the fields that never change keep those
 * apart. `shared` and `display_name` are left out because they can change, and a changed key
 * would remount the entry and close its panel.
 */
export function connectionKey(connection: Connection): string {
  return (
    connection.id ??
    `${connection.connected_at}-${connection.kind ?? "none"}-${connection.match ?? "none"}`
  );
}
