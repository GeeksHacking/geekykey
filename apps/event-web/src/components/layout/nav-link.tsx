import type { Icon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type NavTarget =
  | "/"
  | "/passport"
  | "/activity"
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
  bar: "group flex flex-1 flex-col items-center rounded-md py-1.5 text-xs font-medium text-muted-foreground data-[status=active]:font-semibold",
  side: "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  top: "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground",
};

/*
  The branding kit marks the current item as a solid yellow segment with the yellow fills'
  usual edge. inset-ring rather than ring, so the focus ring still shows on top of it, and the
  ring is offset as on buttons, because on dark it is the same yellow as the fill.
*/
const ACTIVE =
  "data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:inset-ring data-[status=active]:inset-ring-primary-edge";

/*
  On the phone bar the segment shrinks to a pill around the icon and label, so it no longer
  fills a third of the screen and stays clear of the safe area. The link carries the group and
  the data-status; the pill keys off both.
*/
const ACTIVE_BAR =
  "group-data-[status=active]:bg-primary group-data-[status=active]:text-primary-foreground group-data-[status=active]:inset-ring group-data-[status=active]:inset-ring-primary-edge";

/*
  No colour transition: the old item fading out while the new one fades in left both half-lit
  for 150 ms, which read as the tabs flickering. The design rules animate transform and opacity
  only.
*/
/** TanStack Router marks the current link with data-status="active"; the styles key off that. */
export function NavLink({ to, icon: IconComponent, label, variant, exact = false }: NavLinkProps) {
  const isBar = variant === "bar";
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn(
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        isBar ? undefined : ACTIVE,
      )}
    >
      {isBar ? (
        <span className={cn("flex flex-col items-center gap-1 rounded-md px-2 py-1", ACTIVE_BAR)}>
          <IconComponent className="h-5 w-5" aria-hidden />
          <span>{label}</span>
        </span>
      ) : (
        <>
          <IconComponent className="h-4 w-4" aria-hidden />
          <span>{label}</span>
        </>
      )}
    </Link>
  );
}
