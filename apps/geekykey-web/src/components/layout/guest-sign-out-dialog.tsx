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
 * Asks a guest before they sign out, in section 13's words. Signing out ends a guest's
 * Firebase sign-in for good, and the next "Continue as guest" is a new user ID (agreement
 * 7.2), so the tokens and stamps stay with a guest nobody can log in as again. The sign-out
 * itself stays, because it's how a shared phone goes to the next person.
 *
 * Opened by the shell rather than by a trigger of its own, since only a guest sees it and
 * the shell finds that out after the menu item is chosen.
 */
export function GuestSignOutDialog({
  open,
  onOpenChange,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of this guest login?</AlertDialogTitle>
          <AlertDialogDescription>
            You can't log back in as this guest, so your tokens and stamps stay with it. If you sign
            out by mistake, ask at the desk to release your tokens so you can claim them again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay signed in</AlertDialogCancel>
          <AlertDialogAction onClick={onSignOut}>Sign out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
