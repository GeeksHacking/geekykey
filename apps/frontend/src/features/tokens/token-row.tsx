import { Key } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/api/context";
import { describeError, isApiErrorCode } from "@/api/errors";
import type { Token } from "@/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatUid, formatWhen } from "@/lib/format";

interface TokenRowProps {
  token: Token;
  onUnpaired: () => Promise<void> | void;
}

export function TokenRow({ token, onUnpaired }: TokenRowProps) {
  const api = useApi();
  const [pending, setPending] = useState(false);

  async function unpair() {
    setPending(true);
    try {
      await api.unpairToken(token.uid);
      toast.success("Token unpaired");
      await onUnpaired();
    } catch (error) {
      toast.error(
        isApiErrorCode(error, "not_found") ? "That token is no longer paired to you." : describeError(error),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Key className="h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{formatUid(token.uid)}</p>
          <p className="text-xs text-muted-foreground">
            Paired <time dateTime={token.paired_at}>{formatWhen(token.paired_at)}</time>
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            Unpair
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Your stamps and history stay. Someone else can pair this token afterwards, so only do this
              if it is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void unpair()}>Unpair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
