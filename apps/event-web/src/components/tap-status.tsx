import type { TapStatus } from "@/api/types";
import { TAP_STATUS_META } from "@/components/tap-status-meta";
import { cn } from "@/lib/utils";

interface TapStatusLabelProps {
  status: TapStatus;
  className?: string;
}

export function TapStatusLabel({ status, className }: TapStatusLabelProps) {
  const meta = TAP_STATUS_META[status];
  const StatusIcon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        meta.textClass,
        className,
      )}
    >
      <StatusIcon weight="fill" className="h-4 w-4 shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}
