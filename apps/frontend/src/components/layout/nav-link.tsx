import type { Icon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type NavTarget =
  | "/"
  | "/passport"
  | "/activity"
  | "/pair"
  | "/admin/stations"
  | "/admin/taps"
  | "/admin/fallback"
  | "/admin/summary";

interface NavLinkProps {
  to: NavTarget;
  icon: Icon;
  label: string;
  /** bar: phone bottom bar. side: console sidebar. top: header row. */
  variant: "bar" | "side" | "top";
  exact?: boolean;
}

const VARIANTS: Record<NavLinkProps["variant"], string> = {
  bar: "flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-primary-text",
  side: "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground",
  top: "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground",
};

/** TanStack Router marks the current link with data-status="active"; the styles key off that. */
export function NavLink({ to, icon: IconComponent, label, variant, exact = false }: NavLinkProps) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn(
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        VARIANTS[variant],
      )}
    >
      <IconComponent className={variant === "bar" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
