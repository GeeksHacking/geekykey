import type { Connection } from "@/api/types";
import { cn } from "@/lib/utils";

interface ConnectionPersonProps {
  connection: Connection;
  /**
   * compact: the reveal's and Home's smaller, muted bio. lead: the Connections tab's card, where
   * the bio is the main text under the name (FRO-182).
   */
  bio?: "compact" | "lead";
}

/**
 * Who a connection is with: their current name, bio and contact line, as the reveal, Home's row
 * and the Connections tab's card all show them (BAC-147). A field they don't have takes no line,
 * and someone with no name shows as `Guest` (BAC-136).
 */
export function ConnectionPerson({ connection, bio = "compact" }: ConnectionPersonProps) {
  return (
    <>
      <p className="type-item break-words">{connection.display_name ?? "Guest"}</p>
      {connection.bio ? (
        <p
          className={cn("mt-0.5 break-words", bio === "compact" && "text-sm text-muted-foreground")}
        >
          {connection.bio}
        </p>
      ) : null}
      {connection.contact_line ? (
        <p className="mt-0.5 text-sm break-words">Contact: {connection.contact_line}</p>
      ) : null}
    </>
  );
}
