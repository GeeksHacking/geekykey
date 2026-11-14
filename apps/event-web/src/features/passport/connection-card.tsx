import type { Connection, MeResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { ConnectionDetails } from "@/features/passport/connection-details";
import { ConnectionPerson } from "@/features/passport/connection-person";

interface ConnectionCardProps {
  connection: Connection;
  me: MeResponse;
  showDice: boolean;
  canPlay: boolean;
}

/**
 * One person on the Connections tab (FRO-182): the place for their avatar, then the name, the
 * bio as the card's main text and their contact line, with what the connection holds under them.
 * It is not a link yet; a press opens the person's profile once FRO-183 lands.
 */
export function ConnectionCard({ connection, me, showDice, canPlay }: ConnectionCardProps) {
  return (
    <li className="px-3 py-4">
      <div className="flex items-start gap-3">
        {/*
          The avatar's place, kept at the size the shared component will draw it, so the card
          doesn't move when FRO-181 lands.
        */}
        <div aria-hidden className="size-14 shrink-0 rounded-md bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ConnectionPerson connection={connection} bio="lead" />
            </div>
            <Badge variant={connection.match === null ? "muted" : "outline"} className="shrink-0">
              {connection.match === null ? "Connected" : `${connection.match}% match`}
            </Badge>
          </div>
          <ConnectionDetails
            connection={connection}
            me={me}
            showDice={showDice}
            canPlay={canPlay}
          />
        </div>
      </div>
    </li>
  );
}
