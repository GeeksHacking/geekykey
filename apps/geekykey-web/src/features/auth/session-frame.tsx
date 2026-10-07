import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { AccountMenu } from "@/components/layout/account-menu";
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

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // The provider has already cleared identity data; keep the failure visible without
      // leaving an unhandled rejection from the menu callback.
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
          onSignOut={() => void signOut()}
        />
      </header>
      <div className="flex-1 pb-16">{children}</div>
    </div>
  );
}
