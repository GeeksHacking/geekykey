import { ClockCounterClockwise, House, Key, Stamp } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { User } from "@/api/types";
import { AccountMenu } from "@/components/layout/account-menu";
import { NavLink } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useRouteHeadingFocus } from "@/lib/use-route-heading-focus";
import { Wordmark } from "@/components/layout/wordmark";

const NAV = [
  { to: "/", label: "Home", icon: House, exact: true },
  { to: "/passport", label: "Passport", icon: Stamp, exact: false },
  { to: "/activity", label: "Activity", icon: ClockCounterClockwise, exact: false },
  { to: "/pair", label: "Token", icon: Key, exact: false },
] as const;

interface ParticipantShellProps {
  user: User;
  onSignOut: () => void;
  children: ReactNode;
}

/** Phone first: bottom tab bar under md, the same links move into the header above it. */
export function ParticipantShell({ user, onSignOut, children }: ParticipantShellProps) {
  useRouteHeadingFocus();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label="GeekyKey home">
            <Wordmark />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} variant="top" {...item} />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu
              user={user}
              onSignOut={onSignOut}
              consoleLink={user.role === "organizer" ? "admin" : undefined}
            />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 outline-none md:pb-12"
      >
        {children}
      </main>
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-3xl px-2">
          {NAV.map((item) => (
            <NavLink key={item.to} variant="bar" {...item} />
          ))}
        </div>
      </nav>
    </div>
  );
}
