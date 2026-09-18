import type { FallbackTapResponse } from "@/api/types";
import { TapStatusLabel } from "@/components/tap-status";
import { TAP_STATUS_META } from "@/components/tap-status-meta";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FallbackResultProps {
  result: FallbackTapResponse["result"];
  onReset: () => void;
}

/** Same three outcomes as a station tap, read out loud to the organiser at the desk. */
export function FallbackResult({ result, onReset }: FallbackResultProps) {
  const meta = TAP_STATUS_META[result.status];
  return (
    <div role="status" className={cn("space-y-4 rounded-lg border p-5", meta.bgClass)}>
      <div>
        <TapStatusLabel status={result.status} className="text-base" />
        <p className="mt-1 text-sm">{meta.organiserNote}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Tap {result.id}</p>
      </div>
      <Button variant="outline" onClick={onReset}>
        Log another
      </Button>
    </div>
  );
}
