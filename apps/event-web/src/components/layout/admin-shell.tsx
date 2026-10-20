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

/** Laptop first: sidebar from lg up, a scrolling tab row under the header below that. */
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
          <Link to="/admin/stations" aria-label="Organiser console home">
            <Wordmark />
          </Link>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
            Organiser
          </span>
        </div>
        <nav aria-label="Console" className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink key={item.to} variant="side" {...item} />
          ))}
        </nav>
        <div className="flex items-center justify-between border-t p-3">
          <AccountMenu user={user} onSignOut={onSignOut} consoleLink="participant" />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-h-[100dvh] min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-sm lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/admin/stations" aria-label="Organiser console home">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <AccountMenu user={user} onSignOut={onSignOut} consoleLink="participant" />
            </div>
          </div>
          <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-2 pb-2">
            {NAV.map((item) => (
              <NavLink key={item.to} variant="top" {...item} />
            ))}
          </nav>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-hidden lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <DataSourceNotice />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
