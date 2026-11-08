import { Key, ListNumbers } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { MeResponse } from "@/api/types";
import { AccountMenu } from "@/components/layout/account-menu";
import { PlaceMenu } from "@/components/layout/place-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Wordmark } from "@/components/layout/wordmark";
import { HOME_PATH } from "@/lib/constants";

interface TokenHeaderProps {
  user: MeResponse["user"];
  events: MeResponse["events"];
  onSignOut: () => void;
  onEvent: (eventId: string) => void;
  eventLinkPending: boolean;
}

export function TokenHeader({
  user,
  events,
  onSignOut,
  onEvent,
  eventLinkPending,
}: TokenHeaderProps) {
  return (
    <header className="border-b bg-background/90 backdrop-blur-sm md:sticky md:top-0 md:z-30">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="GeekyKey home" className="shrink-0">
          <Wordmark />
        </Link>
        <div className="flex min-w-0 items-center gap-1">
          <ThemeToggle />
          <AccountMenu
            userId={user.id}
            isGeekyKeyAdmin={user.is_geekykey_admin}
            onSignOut={onSignOut}
          />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
        <PlaceMenu events={events} onEvent={onEvent} eventLinkPending={eventLinkPending} />
        {user.can_view_token_kinds ? (
          <nav aria-label="Token pages" className="flex items-center gap-1">
            {[
              { to: HOME_PATH, label: "My tokens", icon: Key },
              { to: "/admin/token-kinds", label: "Token kinds", icon: ListNumbers },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:inset-ring data-[status=active]:inset-ring-primary-edge"
              >
                <Icon className="size-4" aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
