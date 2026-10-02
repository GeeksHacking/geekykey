import { Check, Copy, Key } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function DashboardClaimHelp({ userId }: { userId: string }) {
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
    <section
      aria-labelledby="claim-token-title"
      className="space-y-4 rounded-lg border border-primary-text/40 bg-primary/15 p-4 dark:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div>
          <h2 id="claim-token-title" className="font-medium">
            Tap your token with your phone to claim it
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Claim it in the GeekyKey app, then tap any event station to start collecting stamps.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-text/20 pt-3">
        <p className="text-sm">
          Portal user ID: <code className="font-mono">{userId}</code>
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void copyUserId()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <a
            href="https://geekykey.geekshacking.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary-text underline-offset-4 hover:underline"
          >
            My tokens
          </a>
        </div>
      </div>
    </section>
  );
}
