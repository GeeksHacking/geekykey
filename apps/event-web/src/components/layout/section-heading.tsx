import { cn } from "@/lib/utils";

/**
 * A section of a screen. The tabs already lead to the other screens, so this links nowhere.
 * The yellow marker is the GeekyKey screens' Token kinds heading (FRO-159), with the charcoal
 * edge every yellow fill takes, because yellow alone barely shows on the light theme.
 */
export function SectionHeading({
  title,
  id,
  className,
}: {
  title: string;
  id?: string;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("type-section mb-3 flex items-center gap-2", className)}>
      <span
        aria-hidden
        data-section-marker
        className="h-5 w-1.5 shrink-0 rounded-full border border-primary-edge bg-primary"
      />
      {title}
    </h2>
  );
}
