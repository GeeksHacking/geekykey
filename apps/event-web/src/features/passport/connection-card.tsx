import { Link } from "@tanstack/react-router";

import type { Connection, MeResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { ConnectionDetails } from "@/features/passport/connection-details";
import { PersonCard } from "@/features/passport/person-card";

interface ConnectionCardProps {
  connection: Connection;
  me: MeResponse;
  showDice: boolean;
  canPlay: boolean;
}

/**
 * One person on the Connections tab (FRO-182): the place for their avatar, then the name, the
 * bio as the card's main text and their contact line, with what the connection holds under them.
 * The person's side opens their profile (FRO-183); the details stay outside the link, because
 * the shared answers and the reaction test are buttons. A connection from a service before
 * BAC-156 has no ID, so its card doesn't open.
 */
export function ConnectionCard({ connection, me, showDice, canPlay }: ConnectionCardProps) {
  const person = (
    <PersonCard
      name={connection.display_name ?? "Guest"}
      bio={connection.bio}
      contactLine={connection.contact_line}
      look={connection.avatar}
    />
  );
  return (
    <li className="px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        {connection.id ? (
          <Link
            to="/connections/$id"
            params={{ id: connection.id }}
            aria-label={connection.display_name ?? "Guest"}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {person}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{person}</div>
        )}
        <Badge variant={connection.match === null ? "muted" : "outline"} className="shrink-0">
          {connection.match === null ? "Connected" : `${connection.match}% match`}
        </Badge>
      </div>
      <ConnectionDetails connection={connection} me={me} showDice={showDice} canPlay={canPlay} />
    </li>
  );
}
