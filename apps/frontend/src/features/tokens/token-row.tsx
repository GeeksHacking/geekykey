import { Key } from "@phosphor-icons/react";
import { toast } from "sonner";

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
import { useUnpairToken } from "@/features/tokens/use-unpair-token";
import { formatUid, formatWhen } from "@/lib/format";

export function TokenRow({ token }: { token: Token }) {
  const unpairToken = useUnpairToken();

  async function unpair() {
    try {
      await unpairToken.mutateAsync(token.uid);
      toast.success("Token unpaired");
    } catch (error) {
      toast.error(
        isApiErrorCode(error, "not_found") ? "That token is no longer paired to you." : describeError(error),
      );
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
          <Button variant="ghost" size="sm" disabled={unpairToken.isPending}>
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
