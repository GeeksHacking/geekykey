import { Broadcast, ChartBar, ListBullets, QrCode } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { User } from "@/api/types";
import { AccountMenu } from "@/components/layout/account-menu";
import { DataSourceNotice } from "@/components/layout/data-source-notice";
import { NavLink } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useRouteHeadingFocus } from "@/lib/use-route-heading-focus";
import { Wordmark } from "@/components/layout/wordmark";

const NAV = [
  { to: "/admin/stations", label: "Stations", icon: Broadcast },
  { to: "/admin/taps", label: "Scan log", icon: ListBullets },
  { to: "/admin/fallback", label: "QR fallback", icon: QrCode },
  { to: "/admin/summary", label: "Summary", icon: ChartBar },
] as const;

interface AdminShellProps {
  user: User;
  onSignOut: () => void;
  children: ReactNode;
}

/**
 * Laptop first: sidebar from lg up, the participant shell's bottom tab bar below that. The bar
 * shows from 768 to 1023 px too, where there is no sidebar; the screens only have to stay
 * usable at 768 px, and every tab fits at 360 px.
 */
export function AdminShell({ user, onSignOut, children }: AdminShellProps) {
  useRouteHeadingFocus();

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-sm"
      >
        Skip to content
      </a>
      <aside className="hidden border-r lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          {/* FRO-64. The wordmark keeps its width in the sidebar and in the phone header, and a
              long display name in the account menu gives way instead. */}
          <Link to="/admin/stations" aria-label="Organiser console home" className="shrink-0">
            <Wordmark />
          </Link>
          <span className="look-label rounded-md bg-secondary px-1 py-0.5 text-[10px] font-medium tracking-normal text-secondary-foreground">
            Organiser
          </span>
        </div>
        <nav aria-label="Console" className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink key={item.to} variant="side" {...item} />
          ))}
        </nav>
        <div className="flex min-w-0 items-center justify-between gap-2 border-t p-3">
          <AccountMenu user={user} onSignOut={onSignOut} consoleLink="participant" />
          <ThemeToggle />
        </div>
      </aside>
      {/* The look's grid sits behind the workspace only, so the sidebar stays plain. */}
      <div className="flex min-h-[100dvh] min-w-0 flex-col bg-look-grid">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-sm lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/admin/stations" aria-label="Organiser console home" className="shrink-0">
              <Wordmark />
            </Link>
            <div className="flex min-w-0 items-center gap-1">
              <ThemeToggle />
              <AccountMenu user={user} onSignOut={onSignOut} consoleLink="participant" />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 pt-6 pb-28 outline-hidden lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <DataSourceNotice />
            {children}
          </div>
        </main>
        <nav
          aria-label="Console"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl px-2">
            {NAV.map((item) => (
              <NavLink key={item.to} variant="bar" {...item} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
