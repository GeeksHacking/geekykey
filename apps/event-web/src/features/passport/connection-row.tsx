import type { Connection, MeResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { ConnectionDetails } from "@/features/passport/connection-details";
import { ConnectionPerson } from "@/features/passport/connection-person";

interface ConnectionRowProps {
  connection: Connection;
  me: MeResponse;
  showDice: boolean;
  canPlay: boolean;
}

/**
 * One connection in Home's list (BAC-136 and BAC-147, agreement 0.14). Every row has the same
 * shape whatever it holds: the person with their match beside them, then what the connection
 * holds. The Connections tab shows the same details on a card (FRO-182).
 */
export function ConnectionRow({ connection, me, showDice, canPlay }: ConnectionRowProps) {
  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ConnectionPerson connection={connection} />
        </div>
        <Badge variant={connection.match === null ? "muted" : "outline"} className="shrink-0">
          {connection.match === null ? "Connected" : `${connection.match}% match`}
        </Badge>
      </div>
      <ConnectionDetails connection={connection} me={me} showDice={showDice} canPlay={canPlay} />
    </li>
  );
}
