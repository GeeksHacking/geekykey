import type { FallbackTapResponse } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { TapStatusLabel } from "@/components/tap-status";
import { TAP_STATUS_META } from "@/components/tap-status-meta";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FallbackResultProps {
  result: FallbackTapResponse["result"];
  onReset: () => void;
}

/** The two QR fallback outcomes, read out loud to the organiser at the desk. */
export function FallbackResult({ result, onReset }: FallbackResultProps) {
  const meta = TAP_STATUS_META[result.status];
  return (
    <div role="status" className={cn("relative grid gap-4 rounded-lg border p-5", meta.bgClass)}>
      <CornerBrackets />
      <div>
        <TapStatusLabel status={result.status} className="text-base" />
        <p className="mt-1 text-sm">{meta.organiserNote}</p>
        <p className="mt-2 look-label text-muted-foreground">Tap {result.id}</p>
      </div>
      <Button variant="outline" className="justify-self-start" onClick={onReset}>
        Log another
      </Button>
    </div>
  );
}
