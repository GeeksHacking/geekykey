import type { Connection } from "@/api/types";

/**
 * Who a connection is with: their current name, bio and contact line, as the reveal and the list
 * both show them (BAC-147). A field they don't have takes no line, and someone with no name shows
 * as `Guest` (BAC-136).
 */
export function ConnectionPerson({ connection }: { connection: Connection }) {
  return (
    <>
      <p className="type-item break-words">{connection.display_name ?? "Guest"}</p>
      {connection.bio ? (
        <p className="mt-0.5 text-sm break-words text-muted-foreground">{connection.bio}</p>
      ) : null}
      {connection.contact_line ? (
        <p className="mt-0.5 text-sm break-words">Contact: {connection.contact_line}</p>
      ) : null}
    </>
  );
}
