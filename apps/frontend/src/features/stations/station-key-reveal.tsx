import { Check, Copy, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { CreateStationResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StationKeyRevealProps {
  result: CreateStationResponse;
  onDone: () => void;
}

/** The agreement returns the key exactly once. Nothing here stores it; it lives only in this dialog. */
export function StationKeyReveal({ result, onDone }: StationKeyRevealProps) {
  const [copied, setCopied] = useState(false);
  const copiedResetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
    },
    [],
  );

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(result.api_key);
      if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
      setCopied(true);
      copiedResetTimer.current = window.setTimeout(() => {
        copiedResetTimer.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      toast.error("Could not copy. Select the key and copy it by hand.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{result.station.label} is ready</DialogTitle>
        <DialogDescription>
          Put this key into the station&apos;s setup mode. You can replace it later, and the station
          keeps its ID, its passport settings and its stamps.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-lg border border-status-cooldown/40 bg-status-cooldown/10 p-3 text-sm">
        <Warning
          weight="fill"
          className="mt-0.5 h-4 w-4 shrink-0 text-status-cooldown"
          aria-hidden
        />
        <p>Copy it now. It is shown once, and closing this dialog hides it for good.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="station-key">Station key</Label>
        <Input
          id="station-key"
          readOnly
          value={result.api_key}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Done
        </Button>
        <Button type="button" onClick={() => void copyKey()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy key"}
        </Button>
      </DialogFooter>
    </>
  );
}
