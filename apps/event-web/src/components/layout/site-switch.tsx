import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/*
  FRO-141. The event and key screens keep separate sessions (agreement 3), and this is the
  way across from the event screens. The current site is plain text with aria-current, so it
  cannot be followed to where it already is; the other is a link. The styles are the nav's
  current and hover segments, so the yellow fill means the same thing here.
*/
const SEGMENT =
  "flex shrink-0 items-center whitespace-nowrap rounded-md px-1 py-1.5 text-xs font-medium";
const PRESS = "transition-[scale] duration-150 active:scale-[0.98]";
const CURRENT = "bg-primary text-primary-foreground inset-ring inset-ring-primary-edge";
const OTHER =
  "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:inset-ring hover:inset-ring-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteSwitch({ className }: { className?: string }) {
  return (
    <nav aria-label="Sites" className={cn("flex items-center", className)}>
      <span className={cn(SEGMENT, CURRENT)} aria-current="page">
        Event
      </span>
      <a href={GEEKYKEY_SCREENS_URL} className={cn(SEGMENT, PRESS, OTHER)}>
        Key
      </a>
    </nav>
  );
}
