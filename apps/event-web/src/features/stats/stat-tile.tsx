import { formatCount } from "@/lib/format";

interface StatTileProps {
  label: string;
  value: number;
  hint?: string;
}

/** A hero figure, not a chart: one number the organiser reads at a glance. */
export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="py-2 sm:px-6 sm:first:pl-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-4xl font-semibold tracking-heading">{formatCount(value)}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
