import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { AccountMenu } from "@/components/layout/account-menu";
import { GuestSignOutDialog } from "@/components/layout/guest-sign-out-dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useMe, useSession } from "@/lib/session";

/**
 * Joins the session to a signed-in screen: the account menu, and the sign-out that
 * returns to /login. Route files stay one line.
 */
export function SessionFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();
  const [askingGuest, setAskingGuest] = useState(false);

  // A guest is asked first (agreement 13), and anyone else signs out straight away.
  // Firebase is loaded only now, so a signed-in user's pages still don't load it.
  async function chooseSignOut() {
    let guest: boolean;
    try {
      const { isSignedInAsGuest } = await import("@/lib/firebase");
      guest = await isSignedInAsGuest();
    } catch (error) {
      // Ask when Firebase can't say: an extra question costs a Google user one tap, and a
      // missing one costs a guest their tokens.
      console.error("Checking for a guest sign-in failed", error);
      guest = true;
    }
    if (guest) setAskingGuest(true);
    else await signOut();
  }

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // The provider has already cleared identity data; keep the failure visible without
      // leaving an unhandled rejection from the menu callback. It cannot be inline, because
      // by now the user is on /login, so it is a toast from the Toaster in routes/__root.tsx,
      // which stays mounted across that redirect.
      toast.error(describeError(error));
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-6">
      <header className="flex items-center justify-end gap-1 py-4">
        <ThemeToggle />
        <AccountMenu
          userId={me.user.id}
          isGeekyKeyAdmin={me.user.is_geekykey_admin}
          onSignOut={() => void chooseSignOut()}
        />
        <GuestSignOutDialog
          open={askingGuest}
          onOpenChange={setAskingGuest}
          onSignOut={() => void signOut()}
        />
      </header>
      <div className="flex-1 pb-16">{children}</div>
    </div>
  );
}
