import { cn } from "@/lib/utils";

const ARM = "absolute h-2.5 w-2.5 border-current";

/**
 * The sci-fi look's corner brackets: four thin corners just outside the nearest `relative`
 * box, like a viewfinder. Decoration only, so screen readers skip them and nothing animates
 * them; they move only with the box they frame.
 */
export function CornerBrackets({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute -inset-1 text-primary-text", className)}
    >
      <span className={cn(ARM, "top-0 left-0 border-t border-l")} />
      <span className={cn(ARM, "top-0 right-0 border-t border-r")} />
      <span className={cn(ARM, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(ARM, "right-0 bottom-0 border-r border-b")} />
    </span>
  );
}
