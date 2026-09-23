import type { MeTap } from "@/api/types";
import { TAP_STATUS_META } from "@/components/tap-status-meta";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ParticipantTapRow({ tap }: { tap: MeTap }) {
  const meta = TAP_STATUS_META[tap.status];
  const StatusIcon = meta.icon;
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <span
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md",
          meta.bgClass,
          meta.textClass,
        )}
      >
        <StatusIcon weight="fill" className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-medium">{tap.station_name}</p>
          <time
            dateTime={tap.received_at}
            className="shrink-0 font-mono text-xs text-muted-foreground"
          >
            {formatTime(tap.received_at)}
          </time>
        </div>
        <p className={cn("text-sm", meta.textClass)}>{meta.participantLabel}</p>
        {meta.participantReason ? (
          <p className="text-sm text-muted-foreground">{meta.participantReason}</p>
        ) : null}
        {tap.source === "qr_fallback" ? (
          <p className="mt-1 text-xs text-muted-foreground">Logged by an organiser</p>
        ) : null}
      </div>
    </li>
  );
}
