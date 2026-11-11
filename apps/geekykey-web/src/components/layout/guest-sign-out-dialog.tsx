import type { MouseEvent } from "react";

import { describeError } from "@/api/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Warns a guest before they sign out, in section 13's words. Signing out ends a guest's
 * Firebase sign-in for good, and the next "Continue as guest" is a new user ID (agreement
 * 7.2), so nobody could release their tokens afterwards except a GeekyKey admin. Going ahead
 * releases them first. The sign-out itself stays, because it's how a shared phone goes to the
 * next person.
 *
 * Opened by its host rather than by a trigger of its own, since only a guest sees it and the
 * host finds that out after Sign out is chosen. It stays open until the host closes it, so a
 * failed release can say why with the guest still signed in.
 */
export function GuestSignOutDialog({
  open,
  hasTokens,
  isPending,
  isSigningOut,
  error,
  onStay,
  onSignOut,
}: {
  open: boolean;
  hasTokens: boolean;
  /** Either button's answer is running, so neither can be pressed. */
  isPending: boolean;
  /** Sign out was the button pressed, so it says it's working. */
  isSigningOut: boolean;
  /** The last failed release, if any. */
  error: unknown;
  onStay: () => void;
  onSignOut: () => void;
}) {
  function signOut(event: MouseEvent) {
    // An action closes the dialog on its own unless stopped, which would hide a failure.
    event.preventDefault();
    onSignOut();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onStay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of this guest login?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasTokens
              ? "You can't log back in as this guest, and your tokens will be released so anyone can claim them. Your connections and points stay as they are."
              : "You can't log back in as this guest. Your connections and points stay as they are."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div role="alert" className="text-sm text-destructive-text">
            <p>Couldn't release your tokens, so you're still signed in.</p>
            <p>{describeError(error)}</p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={signOut}>
            {isSigningOut ? "Signing out" : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
