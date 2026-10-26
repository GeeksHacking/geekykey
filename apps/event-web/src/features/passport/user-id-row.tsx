import { Check, Copy } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/*
  The user ID an organiser asks for when logging a QR fallback. Agreement 0.4:
  a Firebase UID at the showcase, the Portal's user ID once events log in through
  the Portal. It stays small and always visible because a station can fail at any
  point in the event, not only for someone who has never tapped. Copied the same
  way as the station key reveal: write to the clipboard, then confirm briefly.
*/
export function UserIdRow({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);
  const copiedResetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
    },
    [],
  );

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(userId);
      if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
      setCopied(true);
      copiedResetTimer.current = window.setTimeout(() => {
        copiedResetTimer.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      toast.error("Could not copy. Select the ID and copy it manually.");
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <p className="text-sm text-muted-foreground">
        Your user ID: <code className="font-mono text-foreground">{userId}</code>
      </p>
      <Button variant="outline" onClick={() => void copyUserId()}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
