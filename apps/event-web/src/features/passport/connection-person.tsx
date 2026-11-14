import type { Connection } from "@/api/types";
import { PersonLines } from "@/features/passport/person-lines";

interface ConnectionPersonProps {
  connection: Connection;
  /**
   * compact: the reveal's and Home's smaller, muted bio. lead: the Connections tab's card, where
   * the bio is the main text under the name (FRO-182).
   */
  bio?: "compact" | "lead";
}

/**
 * Who a connection is with: their current name, bio and contact line, as the reveal and Home's
 * rows show them (BAC-147). A field they don't have takes no line, and someone with no name shows
 * as `Guest` (BAC-136).
 */
export function ConnectionPerson({ connection, bio = "compact" }: ConnectionPersonProps) {
  return (
    <PersonLines
      name={connection.display_name ?? "Guest"}
      bio={connection.bio}
      contactLine={connection.contact_line}
      bioSize={bio}
    />
  );
}
