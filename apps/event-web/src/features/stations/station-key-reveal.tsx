import { Check, Copy, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { StationKeyResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StationKeyRevealProps {
  /** 9.7 creates a station and 9.8 replaces one key, so only a replacement has an old key to lose. */
  kind: "create" | "replace";
  result: StationKeyResponse;
  onDone: () => void;
}

/** The agreement returns the key exactly once. Nothing here stores it; it lives only in this dialog. */
export function StationKeyReveal({ kind, result, onDone }: StationKeyRevealProps) {
  const [copied, setCopied] = useState(false);
  const copiedResetTimer = useRef<number | null>(null);

  const isReplacement = kind === "replace";
  const title = isReplacement
    ? `${result.station.label} has a new key`
    : `${result.station.label} is ready`;
  // The setup mode is where either key goes. A replacement also has to say the old one is
  // going, because 9.8 stops it within a minute, and that the station is untouched.
  const description = isReplacement
    ? "Put this key into the station's setup mode. The old key stops working within a minute. It is the same station, so its ID, its passport settings and its stamps all stay."
    : "Put this key into the station's setup mode. You can replace it later, and the station keeps its ID, its passport settings and its stamps.";

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
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
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
