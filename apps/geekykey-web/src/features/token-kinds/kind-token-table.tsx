import type { AdminKindToken } from "@/api/types";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format";

export function KindTokenTable({
  tokens,
  busy,
  onRemove,
}: {
  tokens: AdminKindToken[];
  busy: boolean;
  onRemove: (uid: string) => void;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="min-w-[44rem] w-full text-left text-sm">
        <caption className="sr-only">Tokens, kinds and current claims</caption>
        <thead className="border-b bg-muted/40">
          <tr>
            {["UID", "Kind", "Owner ID", "Claimed", "Action"].map((title) => (
              <th scope="col" key={title} className="px-3 py-3 font-medium">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {tokens.map((token) => (
            <tr key={token.uid}>
              <th scope="row" className="px-3 py-3 font-mono font-normal">
                {token.uid}
              </th>
              <td className="px-3 py-3">{token.kind ?? "No kind"}</td>
              <td className="min-w-44 max-w-64 break-all px-3 py-3 font-mono">
                {token.owner_id ?? "Unclaimed"}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {token.claimed_at ? (
                  <time dateTime={token.claimed_at} title={token.claimed_at}>
                    {formatWhen(token.claimed_at)}
                  </time>
                ) : (
                  "Not claimed"
                )}
              </td>
              <td className="px-3 py-3">
                {token.kind === null ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${token.uid}`}
                    onClick={() => onRemove(token.uid)}
                  >
                    Remove
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
