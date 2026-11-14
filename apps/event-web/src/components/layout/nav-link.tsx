import type { Icon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type NavTarget =
  | "/"
  | "/connections"
  | "/passport"
  | "/activity"
  | "/admin/stations"
  | "/admin/groups"
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
  /** How many things wait behind this link, with what they are for a screen reader. */
  count?: { value: number; label: string };
}

const VARIANTS: Record<NavLinkProps["variant"], string> = {
  bar: "flex flex-1 flex-col items-center rounded-md py-1.5 text-xs font-medium text-muted-foreground",
  side: "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground",
  top: "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground",
};

/*
  The branding kit marks the current item as a solid yellow segment with the yellow fills'
  usual edge. inset-ring rather than ring, so the focus ring still shows on top of it, and the
  ring is offset as on buttons, because on dark it is the same yellow as the fill.
*/
const ACTIVE =
  "data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:inset-ring data-[status=active]:inset-ring-primary-edge";

/*
  Hover says "you can go here" on the other tabs and changes nothing on the current one. It
  fills the tab, outlines it as the kit outlines its controls, and turns the icon the accent
  colour. Tailwind already limits hover: to devices with a mouse, so a tab never stays lit after
  a tap on a phone.
*/
const HOVER =
  "not-data-[status=active]:hover:bg-accent not-data-[status=active]:hover:text-accent-foreground not-data-[status=active]:hover:inset-ring not-data-[status=active]:hover:inset-ring-border";
const HOVER_ICON = "group-not-data-[status=active]:group-hover:text-primary-text";

/*
  On the phone bar the segment shrinks to a pill around the icon and label, so it no longer
  fills a third of the screen and stays clear of the safe area. The link carries the group and
  the data-status; the pill keys off both, for the current tab and for hover in a narrow window.
*/
const PILL =
  "group-data-[status=active]:bg-primary group-data-[status=active]:text-primary-foreground group-data-[status=active]:inset-ring group-data-[status=active]:inset-ring-primary-edge group-not-data-[status=active]:group-hover:bg-accent group-not-data-[status=active]:group-hover:text-accent-foreground group-not-data-[status=active]:group-hover:inset-ring group-not-data-[status=active]:group-hover:inset-ring-border";

/** Never colour alone, so it's a number, and it reads the same on and off the yellow segment. */
function Count({
  value,
  label,
  className,
}: NonNullable<NavLinkProps["count"]> & { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 font-mono text-xs leading-none font-medium text-background",
        className,
      )}
    >
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">
        , {value} {label}
      </span>
    </span>
  );
}

/*
  No colour transition: the old item fading out while the new one fades in left both half-lit
  for 150 ms, which read as the tabs flickering. The design rules animate transform and opacity
  only, so only the press eases.
*/
/** TanStack Router marks the current link with data-status="active"; the styles key off that. */
export function NavLink({
  to,
  icon: IconComponent,
  label,
  variant,
  exact = false,
  count,
}: NavLinkProps) {
  const isBar = variant === "bar";
  const hasCount = count !== undefined && count.value > 0;
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn(
        "group transition-[scale] duration-150 active:scale-[0.98]",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        isBar ? undefined : cn(ACTIVE, HOVER),
      )}
    >
      {isBar ? (
        <span
          className={cn("relative flex flex-col items-center gap-1 rounded-md px-2 py-1", PILL)}
        >
          <IconComponent className="h-5 w-5" aria-hidden />
          <span>{label}</span>
          {hasCount ? <Count {...count} className="absolute -top-1 -right-1" /> : null}
        </span>
      ) : (
        <>
          <IconComponent className={cn("h-4 w-4", HOVER_ICON)} aria-hidden />
          <span>{label}</span>
          {hasCount ? <Count {...count} /> : null}
        </>
      )}
    </Link>
  );
}
